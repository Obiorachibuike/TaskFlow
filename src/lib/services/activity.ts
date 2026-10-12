import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ActivityType =
  | "workspace.created"
  | "workspace.updated"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "invitation.revoked"
  | "ownership.transferred"
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "issue.created"
  | "issue.updated"
  | "issue.status_changed"
  | "issue.assigned"
  | "issue.unassigned"
  | "issue.deleted"
  | "issue.duplicated"
  | "issue.moved"
  | "comment.created"
  | "comment.updated"
  | "comment.deleted"
  | "sprint.created"
  | "sprint.updated"
  | "sprint.started"
  | "sprint.completed"
  | "sprint.issues_changed"
  | "label.created"
  | "label.deleted"
  | "attachment.uploaded"
  | "attachment.deleted"
  | "integration.connected"
  | "integration.disconnected"
  | "ai.job_completed";

type Tx = Prisma.TransactionClient | typeof prisma;

export interface ActivityInput {
  workspaceId: string;
  actorId: string;
  type: ActivityType;
  projectId?: string | null;
  issueId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordActivity(tx: Tx, input: ActivityInput) {
  return tx.activity.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      type: input.type,
      projectId: input.projectId ?? null,
      issueId: input.issueId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
