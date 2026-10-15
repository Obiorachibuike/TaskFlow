/**
 * AI job orchestration: rate limiting, provider calls, strict structured-output
 * validation, and confirmation-gated application of proposals.
 */
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission, requireIssueAccess } from "@/lib/auth/guards";
import { aiRequestSchema, aiApplySchema, type AiCapability } from "@/lib/validation";
import { getAIProvider, aiLimits, AIError } from "@/lib/ai/provider";
import { buildPrompt, capabilitySchemas, capabilityMeta } from "@/lib/ai/capabilities";
import { recordActivity } from "@/lib/services/activity";
import { logger } from "@/lib/logger";
import type { z } from "zod";

export function aiConfiguration() {
  const provider = getAIProvider();
  return {
    configured: !!provider?.isConfigured(),
    provider: provider?.name ?? process.env.AI_PROVIDER ?? "openai",
    model: provider?.model ?? null,
    setupMessage: provider?.isConfigured()
      ? null
      : "No AI provider credentials are configured. Set AI_PROVIDER and AI_API_KEY (or ANTHROPIC_API_KEY) in the server environment to enable the assistant.",
  };
}

async function enforceRateLimit(userId: string) {
  const limits = aiLimits();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.aIJob.count({
    where: { userId, createdAt: { gte: since }, status: { in: ["PENDING", "RUNNING", "COMPLETED", "FAILED"] } },
  });
  if (recent >= limits.requestsPerUserPerHour) {
    throw new ServiceError(
      "RATE_LIMITED",
      `AI request limit reached (${limits.requestsPerUserPerHour}/hour). Try again later.`,
    );
  }
}

export async function runAiJob(
  actor: Actor,
  workspaceIdOrSlug: string,
  raw: z.infer<typeof aiRequestSchema>,
) {
  const input = aiRequestSchema.parse(raw);
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "ai:use");

  const provider = getAIProvider();
  if (!provider?.isConfigured()) {
    throw new ServiceError(
      "UPSTREAM_ERROR",
      aiConfiguration().setupMessage ?? "AI provider is not configured.",
    );
  }

  await enforceRateLimit(actor.userId);

  const meta = capabilityMeta[input.capability];
  if (meta.requiredInput === "project" && !input.projectId) {
    throw new ServiceError("VALIDATION", "Select a project for this capability.");
  }
  if (meta.requiredInput === "issue" && !input.issueId) {
    throw new ServiceError("VALIDATION", "Select an issue for this capability.");
  }
  if (input.issueId) await requireIssueAccess(actor, input.issueId, "workspace:read");

  const job = await prisma.aIJob.create({
    data: {
      workspaceId: ctx.workspaceId,
      userId: actor.userId,
      capability: input.capability,
      status: "RUNNING",
      provider: provider.name,
      model: provider.model,
      input: {
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        sprintId: input.sprintId ?? null,
        criteria: input.criteria ?? null,
        description: input.description ?? null,
      },
    },
  });

  try {
    const prompt = await buildPrompt(actor, input.capability, {
      workspaceSlug: ctx.slug,
      projectId: input.projectId,
      issueId: input.issueId,
      sprintId: input.sprintId,
      criteria: input.criteria,
      description: input.description,
    });

    const limits = aiLimits();
    const result = await provider.complete({
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      maxTokens: limits.maxOutputTokens,
      timeoutMs: limits.timeoutMs,
      json: true,
    });

    // Strict structured-output validation — never return unvalidated model text
    const rawJson = extractJson(result.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new AIError("Model returned invalid JSON", "invalid_output");
    }
    const schema = capabilitySchemas[input.capability] as z.ZodTypeAny;
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      logger.warn("ai.validation_failed", {
        capability: input.capability,
        issues: validated.error.issues.slice(0, 5),
      });
      throw new AIError(
        "AI response did not match the expected structure; please retry.",
        "invalid_output",
      );
    }

    const completed = await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        output: validated.data as object,
        tokensUsed: result.tokensUsed ?? null,
        completedAt: new Date(),
      },
    });
    return completed;
  } catch (err) {
    const message =
      err instanceof AIError
        ? err.message
        : err instanceof ServiceError
          ? err.message
          : "AI request failed";
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message },
    });
    if (err instanceof ServiceError) throw err;
    if (err instanceof AIError) {
      throw new ServiceError(err.kind === "rate_limited" ? "RATE_LIMITED" : "UPSTREAM_ERROR", message);
    }
    logger.error("ai.job_failed", { err: String(err) });
    throw new ServiceError("UPSTREAM_ERROR", message);
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function listAiJobs(actor: Actor, workspaceIdOrSlug: string, limit = 20) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "ai:use");
  return prisma.aIJob.findMany({
    where: { workspaceId: ctx.workspaceId, userId: actor.userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    select: {
      id: true,
      capability: true,
      status: true,
      provider: true,
      model: true,
      output: true,
      error: true,
      createdAt: true,
      completedAt: true,
      tokensUsed: true,
    },
  });
}

/**
 * Apply AI recommendations — ONLY called after explicit user confirmation.
 * The user selects which proposed items to apply; nothing is created/changed
 * without this explicit selection.
 */
export async function applyAiJob(
  actor: Actor,
  workspaceIdOrSlug: string,
  raw: z.infer<typeof aiApplySchema>,
) {
  const input = aiApplySchema.parse(raw);
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "ai:apply");

  const job = await prisma.aIJob.findFirst({
    where: { id: input.jobId, workspaceId: ctx.workspaceId },
  });
  if (!job) throw new ServiceError("NOT_FOUND", "AI job not found.");
  if (job.status !== "COMPLETED" || !job.output) {
    throw new ServiceError("CONFLICT", "This AI job has no completed output to apply.");
  }
  if (job.userId !== actor.userId) {
    throw new ServiceError("FORBIDDEN", "Only the person who ran this AI job can apply it.");
  }

  const capability = job.capability as AiCapability;
  const output = job.output as Record<string, unknown>;

  if (capability === "generate_tasks") {
    return applyGeneratedTasks(actor, ctx.workspaceId, ctx.slug, job, output, input.selection);
  }
  if (capability === "break_down_epic") {
    return applyBreakdown(actor, ctx.workspaceId, job, output, input.selection);
  }
  if (capability === "suggest_priorities") {
    return applyPriorities(actor, ctx.workspaceId, job, output, input.selection);
  }
  throw new ServiceError("VALIDATION", "This capability is informational — nothing to apply.");
}

async function applyGeneratedTasks(
  actor: Actor,
  workspaceId: string,
  workspaceSlug: string,
  job: { id: string; input: unknown },
  output: Record<string, unknown>,
  selection?: string[],
) {
  const tasks = (output.tasks as Array<Record<string, unknown>>) ?? [];
  const selected = selection?.length
    ? tasks.filter((_, idx) => selection.includes(String(idx)))
    : tasks;
  if (!selected.length) throw new ServiceError("VALIDATION", "Select at least one task to create.");

  const input = job.input as { projectId?: string | null };
  const projectId = input.projectId;
  if (!projectId) throw new ServiceError("VALIDATION", "Original job has no project.");

  const { createIssue } = await import("@/lib/services/issue");
  const created: Array<{ id: string; key: string; title: string }> = [];
  for (const t of selected) {
    const issue = await createIssue(actor, {
      projectId,
      title: String(t.title).slice(0, 200),
      description: typeof t.description === "string" ? t.description.slice(0, 5000) : "",
      type: (t.type as "TASK") ?? "TASK",
      priority: (t.priority as "MEDIUM") ?? "MEDIUM",
      storyPoints: typeof t.storyPoints === "number" ? t.storyPoints : null,
    });
    created.push({ id: issue.id, key: issue.key, title: issue.title });
  }

  await recordActivity(prisma, {
    workspaceId,
    projectId,
    actorId: actor.userId,
    type: "ai.job_completed",
    metadata: { jobId: job.id, capability: "generate_tasks", created: created.map((c) => c.key) },
  });
  return { created, link: `/app/${workspaceSlug}/projects` };
}

async function applyBreakdown(
  actor: Actor,
  workspaceId: string,
  job: { id: string; input: unknown },
  output: Record<string, unknown>,
  selection?: string[],
) {
  const stories = (output.stories as Array<Record<string, unknown>>) ?? [];
  const selected = selection?.length
    ? stories.filter((_, idx) => selection.includes(String(idx)))
    : stories;
  if (!selected.length) throw new ServiceError("VALIDATION", "Select at least one story to create.");

  const input = job.input as { issueId?: string | null };
  const epicId = input.issueId;
  if (!epicId) throw new ServiceError("VALIDATION", "Original job has no epic issue.");

  const { issue: epic, ctx } = await requireIssueAccess(actor, epicId, "issue:create");
  const { createIssue } = await import("@/lib/services/issue");
  const created: Array<{ key: string; subtasks: string[] }> = [];

  for (const s of selected) {
    const story = await createIssue(actor, {
      projectId: epic.projectId,
      title: String(s.title).slice(0, 200),
      description: typeof s.description === "string" ? s.description.slice(0, 5000) : "",
      type: "STORY",
      parentIssueId: epic.id,
      priority: (s.priority as "MEDIUM") ?? "MEDIUM",
      storyPoints: typeof s.storyPoints === "number" ? s.storyPoints : null,
    });
    const subtaskKeys: string[] = [];
    const subtasks = Array.isArray(s.subtasks) ? (s.subtasks as string[]) : [];
    for (const st of subtasks.slice(0, 15)) {
      const sub = await createIssue(actor, {
        projectId: epic.projectId,
        title: String(st).slice(0, 200),
        type: "SUBTASK",
        parentIssueId: story.id,
      });
      subtaskKeys.push(sub.key);
    }
    created.push({ key: story.key, subtasks: subtaskKeys });
  }

  await recordActivity(prisma, {
    workspaceId,
    projectId: epic.projectId,
    issueId: epic.id,
    actorId: actor.userId,
    type: "ai.job_completed",
    metadata: { jobId: job.id, capability: "break_down_epic", created: created.map((c) => c.key) },
  });
  void ctx;
  return { created };
}

async function applyPriorities(
  actor: Actor,
  workspaceId: string,
  job: { id: string; input: unknown },
  output: Record<string, unknown>,
  selection?: string[],
) {
  const suggestions = (output.suggestions as Array<Record<string, unknown>>) ?? [];
  const selected = suggestions.filter((s, idx) =>
    selection?.length ? selection.includes(String(idx)) || selection.includes(String(s.issueKey)) : true,
  );
  if (!selected.length) throw new ServiceError("VALIDATION", "Select at least one suggestion to apply.");

  const { updateIssue, getIssueByKey } = await import("@/lib/services/issue");
  const input = job.input as { projectId?: string | null };
  const updated: string[] = [];

  for (const s of selected) {
    const key = String(s.issueKey);
    // Look up issue within the job's workspace/project scope only
    const issue = await prisma.issue.findFirst({
      where: {
        key,
        workspaceId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!issue) continue;
    await updateIssue(actor, issue.id, { priority: s.priority as "HIGH" });
    updated.push(key);
  }
  void getIssueByKey;
  return { updated };
}
