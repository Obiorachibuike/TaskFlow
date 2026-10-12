import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission, requireIssueAccess } from "@/lib/auth/guards";
import { getStorage, maxUploadBytes } from "@/lib/storage";
import { recordActivity } from "@/lib/services/activity";
import { slugify } from "@/lib/utils";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function uploadAttachment(
  actor: Actor,
  workspaceIdOrSlug: string,
  input: {
    fileName: string;
    mimeType: string;
    data: Buffer;
    issueId?: string;
    commentId?: string;
  },
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "attachment:upload");

  if (input.data.length > maxUploadBytes()) {
    throw new ServiceError("VALIDATION", `File exceeds the ${maxUploadBytes()} byte limit.`);
  }
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new ServiceError("VALIDATION", `File type ${input.mimeType} is not allowed.`);
  }

  let projectId: string | null = null;
  if (input.issueId) {
    const { issue } = await requireIssueAccess(actor, input.issueId, "attachment:upload");
    if (issue.workspaceId !== ctx.workspaceId) {
      throw new ServiceError("FORBIDDEN", "Issue belongs to another workspace.");
    }
    projectId = issue.projectId;
  }

  const safeName = slugify(input.fileName.replace(/\.[^.]+$/, "")) || "file";
  const ext = (input.fileName.match(/\.[^.]+$/) ?? [""])[0];
  const key = `workspaces/${ctx.workspaceId}/${randomUUID()}-${safeName}${ext}`;

  const storage = getStorage();
  const stored = await storage.put(key, input.data, input.mimeType);

  const attachment = await prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: {
        workspaceId: ctx.workspaceId,
        issueId: input.issueId ?? null,
        commentId: input.commentId ?? null,
        fileName: input.fileName.slice(0, 255),
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.key,
        uploadedById: actor.userId,
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId,
      issueId: input.issueId ?? null,
      actorId: actor.userId,
      type: "attachment.uploaded",
      metadata: { fileName: a.fileName, size: a.sizeBytes },
    });
    return a;
  });
  return attachment;
}

/**
 * Authorization check used by the download route — verifies the requesting
 * user is a member of the workspace that owns the attachment (prevents
 * insecure direct object references).
 */
export async function authorizeAttachmentDownload(
  actor: Actor,
  attachmentId: string,
): Promise<{ attachment: { id: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number }; ctx: { workspaceId: string } }> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null },
  });
  if (!attachment) throw new ServiceError("NOT_FOUND", "Attachment not found.");
  const ctx = await requireWorkspaceMembership(actor, attachment.workspaceId);
  return {
    attachment: {
      id: attachment.id,
      storageKey: attachment.storageKey,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    },
    ctx: { workspaceId: ctx.workspaceId },
  };
}

export async function deleteAttachment(actor: Actor, attachmentId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null },
    include: { issue: { select: { projectId: true } } },
  });
  if (!attachment) throw new ServiceError("NOT_FOUND", "Attachment not found.");
  const ctx = await requireWorkspaceMembership(actor, attachment.workspaceId);

  const isOwner = attachment.uploadedById === actor.userId;
  if (!isOwner) await requirePermission(ctx, "attachment:delete");

  await prisma.$transaction(async (tx) => {
    await tx.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: attachment.issue?.projectId ?? null,
      issueId: attachment.issueId,
      actorId: actor.userId,
      type: "attachment.deleted",
      metadata: { fileName: attachment.fileName },
    });
  });
  await getStorage().delete(attachment.storageKey);
}

export async function listIssueAttachments(actor: Actor, issueId: string) {
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "workspace:read");
  void ctx;
  return prisma.attachment.findMany({
    where: { issueId: issue.id, deletedAt: null },
    include: { uploader: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "desc" },
  });
}
