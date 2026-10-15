/**
 * Server-side authorization guards. Every service/route that touches
 * workspace-owned data must go through these (or the service equivalents).
 */
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import { can, type Permission, type Role } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";

export interface WorkspaceContext {
  workspaceId: string;
  slug: string;
  name: string;
  role: Role;
  userId: string;
}

export async function requireWorkspaceMembership(
  actor: Actor,
  workspaceIdOrSlug: string,
): Promise<WorkspaceContext> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: workspaceIdOrSlug }, { slug: workspaceIdOrSlug }],
    },
    select: { id: true, slug: true, name: true },
  });
  if (!workspace) throw new ServiceError("NOT_FOUND", "Workspace not found.");

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.userId } },
    select: { role: true },
  });
  if (!membership) {
    // Do not leak existence of workspaces the user is not part of
    throw new ServiceError("NOT_FOUND", "Workspace not found.");
  }
  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    role: membership.role as Role,
    userId: actor.userId,
  };
}

export async function requirePermission(
  ctx: { role: Role },
  permission: Permission,
): Promise<void> {
  if (!can(ctx.role, permission)) {
    throw new ServiceError("FORBIDDEN", `Your role cannot perform this action (${permission}).`);
  }
}

export async function requireProjectAccess(
  actor: Actor,
  projectId: string,
  permission: Permission,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, workspaceId: true, key: true, name: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Project not found.");
  const ctx = await requireWorkspaceMembership(actor, project.workspaceId);
  await requirePermission(ctx, permission);
  return { project, ctx };
}

export async function requireIssueAccess(
  actor: Actor,
  issueId: string,
  permission: Permission,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, deletedAt: null },
    select: {
      id: true,
      key: true,
      title: true,
      projectId: true,
      workspaceId: true,
      status: true,
      statusCategory: true,
      reporterId: true,
    },
  });
  if (!issue) throw new ServiceError("NOT_FOUND", "Issue not found.");
  const ctx = await requireWorkspaceMembership(actor, issue.workspaceId);
  await requirePermission(ctx, permission);
  return { issue, ctx };
}

export async function requireWorkspaceBySlug(actor: Actor, slug: string) {
  return requireWorkspaceMembership(actor, slug);
}
