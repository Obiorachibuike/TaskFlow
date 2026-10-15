import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireIssueAccess } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { createCommentSchema, updateCommentSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/services/activity";
import { notify } from "@/lib/services/notifications";
import { realtimeBus } from "@/lib/realtime/bus";
import { extractMentions } from "@/lib/utils";
import type { z } from "zod";

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true, image: true, avatarColor: true } },
  attachments: true,
  _count: { select: { replies: true } },
} as const;

export async function listComments(actor: Actor, issueId: string) {
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "workspace:read");
  void ctx;
  return prisma.issueComment.findMany({
    where: { issueId: issue.id, deletedAt: null, parentId: null },
    include: {
      ...COMMENT_INCLUDE,
      replies: {
        where: { deletedAt: null },
        include: COMMENT_INCLUDE,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function resolveMentions(text: string, workspaceId: string): Promise<Array<{ userId: string; name: string }>> {
  const handles = extractMentions(text);
  if (!handles.length) return [];
  const users = await prisma.user.findMany({
    where: {
      memberships: { some: { workspaceId } },
      OR: [
        { email: { in: handles } },
        ...handles
          .filter((h) => !h.includes("@"))
          .map((h) => ({ name: { equals: h, mode: "insensitive" as const } })),
      ],
    },
    select: { id: true, name: true, email: true },
    take: 25,
  });
  return users.map((u) => ({ userId: u.id, name: u.name }));
}

export async function createComment(actor: Actor, raw: z.infer<typeof createCommentSchema>) {
  const input = createCommentSchema.parse(raw);
  const { issue, ctx } = await requireIssueAccess(actor, input.issueId, "comment:create");

  if (input.parentId) {
    const parent = await prisma.issueComment.findFirst({
      where: { id: input.parentId, issueId: issue.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new ServiceError("VALIDATION", "Parent comment not found.");
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: issue.projectId },
    select: { key: true, workspace: { select: { slug: true } } },
  });

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.issueComment.create({
      data: {
        issueId: issue.id,
        authorId: actor.userId,
        parentId: input.parentId ?? null,
        body: input.body,
      },
      include: COMMENT_INCLUDE,
    });

    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.userId,
      type: "comment.created",
      metadata: { key: issue.key, commentId: created.id },
    });

    // Mention notifications
    const mentioned = await resolveMentions(input.body, ctx.workspaceId);
    for (const m of mentioned) {
      await notify(tx, {
        userId: m.userId,
        workspaceId: ctx.workspaceId,
        type: "mention",
        title: `${actor.name} mentioned you on ${issue.key}`,
        body: input.body.slice(0, 140),
        link: `/app/${project.workspace.slug}/projects/${project.key}/issues/${issue.key}`,
        actorId: actor.userId,
        issueId: issue.id,
      });
    }

    // Notify thread parent author + assignees (who are not the actor and not already mentioned)
    const notifyTargets = new Set<string>();
    if (input.parentId) {
      const parent = await tx.issueComment.findUnique({
        where: { id: input.parentId },
        select: { authorId: true },
      });
      if (parent) notifyTargets.add(parent.authorId);
    }
    if (!input.parentId) {
      const assignees = await tx.issueAssignee.findMany({ where: { issueId: issue.id } });
      for (const a of assignees) notifyTargets.add(a.userId);
    }
    for (const userId of notifyTargets) {
      if (userId === actor.userId || mentioned.some((m) => m.userId === userId)) continue;
      await notify(tx, {
        userId,
        workspaceId: ctx.workspaceId,
        type: "comment",
        title: `${actor.name} commented on ${issue.key}`,
        body: input.body.slice(0, 140),
        link: `/app/${project.workspace.slug}/projects/${project.key}/issues/${issue.key}`,
        actorId: actor.userId,
        issueId: issue.id,
      });
    }
    return created;
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: issue.projectId },
    { type: "comment.created", payload: { issueId: issue.id, projectId: issue.projectId, commentId: comment.id } },
  );
  return comment;
}

export async function updateComment(actor: Actor, raw: z.infer<typeof updateCommentSchema>) {
  const input = updateCommentSchema.parse(raw);
  const comment = await prisma.issueComment.findFirst({
    where: { id: input.commentId, deletedAt: null },
    include: { issue: { select: { id: true, workspaceId: true, projectId: true, key: true } } },
  });
  if (!comment) throw new ServiceError("NOT_FOUND", "Comment not found.");

  const { ctx } = await requireIssueAccess(actor, comment.issueId, "comment:create");
  const isAuthor = comment.authorId === actor.userId;
  const canModerate = can(ctx.role, "comment:moderate");
  if (!isAuthor && !canModerate) {
    throw new ServiceError("FORBIDDEN", "You can only edit your own comments.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.issueComment.update({
      where: { id: comment.id },
      data: { body: input.body },
      include: COMMENT_INCLUDE,
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: comment.issue.projectId,
      issueId: comment.issueId,
      actorId: actor.userId,
      type: "comment.updated",
      metadata: { key: comment.issue.key, commentId: comment.id },
    });
    return u;
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: comment.issue.projectId },
    { type: "comment.updated", payload: { issueId: comment.issueId, commentId: comment.id } },
  );
  return updated;
}

export async function deleteComment(actor: Actor, commentId: string) {
  const comment = await prisma.issueComment.findFirst({
    where: { id: commentId, deletedAt: null },
    include: { issue: { select: { id: true, workspaceId: true, projectId: true, key: true } } },
  });
  if (!comment) throw new ServiceError("NOT_FOUND", "Comment not found.");

  const { ctx } = await requireIssueAccess(actor, comment.issueId, "comment:create");
  const isAuthor = comment.authorId === actor.userId;
  const canModerate = can(ctx.role, "comment:moderate");
  if (!isAuthor && !canModerate) {
    throw new ServiceError("FORBIDDEN", "You can only delete your own comments.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.issueComment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: comment.issue.projectId,
      issueId: comment.issueId,
      actorId: actor.userId,
      type: "comment.deleted",
      metadata: { key: comment.issue.key, commentId: comment.id },
    });
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: comment.issue.projectId },
    { type: "comment.deleted", payload: { issueId: comment.issueId, commentId: comment.id } },
  );
}
