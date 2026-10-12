/**
 * GitHub integration: secure token storage, webhook signature verification,
 * and issue-key ↔ branch/PR association.
 *
 * Credentials are stored AES-256-GCM encrypted (see src/lib/crypto.ts) and are
 * never sent to the client. When no GitHub credentials are configured the UI
 * shows setup documentation instead of a fake "connected" state.
 */
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission } from "@/lib/auth/guards";
import { encryptSecret, safeEqual } from "@/lib/crypto";
import { recordActivity } from "@/lib/services/activity";
import { notify } from "@/lib/services/notifications";
import { logger } from "@/lib/logger";

export function githubConfiguration() {
  const hasOauth = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const hasWebhookSecret = !!process.env.GITHUB_WEBHOOK_SECRET;
  const hasEncryptionKey = !!process.env.INTEGRATION_ENCRYPTION_KEY;
  return {
    oauthEnabled: hasOauth,
    webhooksEnabled: hasWebhookSecret,
    tokenStorageEnabled: hasEncryptionKey,
    setupMessage:
      hasOauth && hasWebhookSecret && hasEncryptionKey
        ? null
        : "GitHub integration is not fully configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET and INTEGRATION_ENCRYPTION_KEY — see docs/GITHUB_SETUP.md.",
  };
}

/** Verify X-Hub-Signature-256 (HMAC-SHA256 over raw body with the webhook secret). */
export function verifyGithubSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.GITHUB_WEBHOOK_SECRET,
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(expected, signatureHeader);
}

/** Extract issue keys like NOVA-104 from a branch name, commit message or PR title. */
export function extractIssueKeys(text: string): string[] {
  const re = /\b([A-Z][A-Z0-9]{1,7}-\d{1,7})\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1]!);
  return [...out];
}

export interface GithubConnectionInput {
  token: string;
  repos?: string[];
  name?: string;
}

export async function connectGithub(actor: Actor, workspaceIdOrSlug: string, input: GithubConnectionInput) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "integration:manage");
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    throw new ServiceError(
      "UPSTREAM_ERROR",
      "Token storage is not configured (INTEGRATION_ENCRYPTION_KEY missing). See docs/GITHUB_SETUP.md.",
    );
  }

  // Validate the token against the GitHub API before storing anything
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "TaskFlow",
    },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!userRes || !userRes.ok) {
    throw new ServiceError("UPSTREAM_ERROR", "GitHub rejected the provided token. Check its scopes.");
  }
  const login = ((await userRes.json()) as { login?: string }).login ?? "unknown";

  const integration = await prisma.$transaction(async (tx) => {
    const existing = await tx.integration.findUnique({
      where: { workspaceId_type: { workspaceId: ctx.workspaceId, type: "GITHUB" } },
    });
    const data = {
      name: input.name ?? `GitHub (@${login})`,
      status: "active",
      config: {
        login,
        repos: input.repos ?? [],
        connectedAt: new Date().toISOString(),
      },
      encryptedSecret: encryptSecret(input.token),
      installedById: actor.userId,
    };
    const integration = existing
      ? await tx.integration.update({ where: { id: existing.id }, data })
      : await tx.integration.create({
          data: { workspaceId: ctx.workspaceId, type: "GITHUB", ...data },
        });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "integration.connected",
      metadata: { type: "GITHUB", login, repos: input.repos ?? [] },
    });
    return integration;
  });

  // Never return the secret
  return {
    id: integration.id,
    type: integration.type,
    name: integration.name,
    status: integration.status,
    config: integration.config,
  };
}

export async function disconnectGithub(actor: Actor, workspaceIdOrSlug: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "integration:manage");
  await prisma.$transaction(async (tx) => {
    await tx.integration.deleteMany({ where: { workspaceId: ctx.workspaceId, type: "GITHUB" } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "integration.disconnected",
      metadata: { type: "GITHUB" },
    });
  });
}

export async function listIntegrations(actor: Actor, workspaceIdOrSlug: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const integrations = await prisma.integration.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      config: true,
      createdAt: true,
    },
  });
  return { integrations, configuration: githubConfiguration() };
}

export type GithubWebhookPayload = Record<string, unknown>;

/**
 * Process a signature-verified GitHub webhook. Stores the delivery for
 * idempotency (unique delivery id) and links branches/PRs to issues whose keys
 * appear in refs/titles. Presence of a branch or PR NEVER marks work done.
 */
export async function processGithubWebhook(input: {
  deliveryId: string;
  eventType: string;
  payload: GithubWebhookPayload;
}) {
  const eventType = input.eventType;

  // Find the integration matching the repository, if connected in any workspace
  const repo = (input.payload.repository as { full_name?: string; html_url?: string } | undefined) ?? {};
  const repoName = repo.full_name;

  const integrations = await prisma.integration.findMany({
    where: { type: "GITHUB" },
  });
  const integration = integrations.find((i) => {
    const config = i.config as { repos?: string[] };
    return !config.repos?.length || (repoName ? config.repos.includes(repoName) : false);
  });
  if (!integration) {
    logger.info("github.webhook.no_integration", { repo: repoName, eventType });
    return { processed: false, reason: "no_matching_integration" };
  }

  // Deduplicate by delivery id (also protects against replays)
  const existing = await prisma.webhookEvent.findUnique({
    where: { deliveryId: input.deliveryId },
  });
  if (existing) return { processed: false, reason: "duplicate_delivery" };

  const event = await prisma.webhookEvent.create({
    data: {
      integrationId: integration.id,
      deliveryId: input.deliveryId,
      eventType,
      payload: input.payload as object,
    },
  });

  try {
    if (eventType === "push") {
      await handlePush(integration.workspaceId, input.payload);
    } else if (eventType === "pull_request") {
      await handlePullRequest(integration.workspaceId, input.payload);
    }
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
    return { processed: true };
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { error: String(err).slice(0, 500) },
    });
    logger.warn("github.webhook.process_failed", { err: String(err), eventType });
    return { processed: false, reason: "handler_error" };
  }
}

async function findIssuesByKeys(workspaceId: string, keys: string[]) {
  if (!keys.length) return [];
  return prisma.issue.findMany({
    where: { workspaceId, key: { in: keys }, deletedAt: null },
    select: { id: true, key: true, projectId: true },
  });
}

async function handlePush(workspaceId: string, payload: GithubWebhookPayload) {
  const ref = String(payload.ref ?? "");
  const branch = ref.replace(/^refs\/heads\//, "");
  const repo = payload.repository as { html_url?: string; full_name?: string };
  const commits = (payload.commits as Array<{ id?: string; message?: string; url?: string }>) ?? [];

  const keys = new Set<string>(extractIssueKeys(branch));
  for (const c of commits) {
    for (const k of extractIssueKeys(c.message ?? "")) keys.add(k);
  }
  const issues = await findIssuesByKeys(workspaceId, [...keys]);
  for (const issue of issues) {
    await prisma.issueReference.upsert({
      where: { issueId_url: { issueId: issue.id, url: `${repo.html_url}/tree/${branch}` } },
      create: {
        issueId: issue.id,
        kind: "BRANCH",
        provider: "github",
        url: `${repo.html_url}/tree/${branch}`,
        title: `${repo.full_name}:${branch}`,
        status: "active",
      },
      update: { status: "active" },
    });
    // Link latest commits (cap to 5 per push)
    for (const c of commits.slice(0, 5)) {
      if (!c.id || !c.url) continue;
      await prisma.issueReference.upsert({
        where: { issueId_url: { issueId: issue.id, url: c.url } },
        create: {
          issueId: issue.id,
          kind: "COMMIT",
          provider: "github",
          url: c.url,
          title: (c.message ?? "").slice(0, 120),
          status: "committed",
        },
        update: {},
      });
    }
  }
}

async function handlePullRequest(workspaceId: string, payload: GithubWebhookPayload) {
  const pr = payload.pull_request as
    | {
        html_url?: string;
        title?: string;
        number?: number;
        state?: string;
        merged?: boolean;
        head?: { ref?: string };
      }
    | undefined;
  const repo = payload.repository as { html_url?: string; full_name?: string };
  if (!pr?.html_url) return;

  const keys = new Set<string>([
    ...extractIssueKeys(pr.title ?? ""),
    ...extractIssueKeys(pr.head?.ref ?? ""),
  ]);
  const issues = await findIssuesByKeys(workspaceId, [...keys]);
  const status = pr.merged ? "merged" : (pr.state ?? "open");

  for (const issue of issues) {
    await prisma.issueReference.upsert({
      where: { issueId_url: { issueId: issue.id, url: pr.html_url } },
      create: {
        issueId: issue.id,
        kind: "PULL_REQUEST",
        provider: "github",
        url: pr.html_url,
        title: `#${pr.number} ${pr.title ?? ""}`.slice(0, 200),
        status,
        metadata: { repo: repo.full_name, branch: pr.head?.ref },
      },
      update: { status },
    });

    // Notify assignees about PR status changes (never auto-complete issues)
    const assignees = await prisma.issueAssignee.findMany({
      where: { issueId: issue.id },
      select: { userId: true },
    });
    for (const a of assignees) {
      await notify(prisma, {
        userId: a.userId,
        workspaceId,
        type: "system",
        title: `PR ${status}: ${pr.title ?? `#${pr.number}`}`,
        body: `Linked to ${issue.key}. The issue is NOT automatically completed — update its status when the work is actually done.`,
        link: pr.html_url,
        issueId: issue.id,
      });
    }
  }
}

export function verifyWebhookOrThrow(rawBody: Buffer | string, signature: string | null | undefined) {
  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    throw new ServiceError(
      "UPSTREAM_ERROR",
      "Webhooks are not configured (GITHUB_WEBHOOK_SECRET missing). See docs/GITHUB_SETUP.md.",
    );
  }
  if (!verifyGithubSignature(rawBody, signature)) {
    throw new ServiceError("FORBIDDEN", "Invalid webhook signature.");
  }
}
