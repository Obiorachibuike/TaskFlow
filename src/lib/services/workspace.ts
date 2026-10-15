import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import {
  requireWorkspaceMembership,
  requirePermission,
  type WorkspaceContext,
} from "@/lib/auth/guards";
import {
  ASSIGNABLE_ROLES,
  can,
  isAtLeast,
  type Role,
} from "@/lib/auth/permissions";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  transferOwnershipSchema,
} from "@/lib/validation";
import { randomToken, sha256Hex } from "@/lib/auth/password";
import { slugify } from "@/lib/utils";
import { recordActivity } from "@/lib/services/activity";
import { notify } from "@/lib/services/notifications";
import { sendInvitationEmail } from "@/lib/email";
import type { z } from "zod";

const INVITE_TTL_DAYS = 7;

export async function listWorkspacesForUser(userId: string) {
  return prisma.workspace.findMany({
    where: { deletedAt: null, members: { some: { userId } } },
    orderBy: { name: "asc" },
    include: {
      members: { where: { userId }, select: { role: true } },
      _count: { select: { projects: { where: { deletedAt: null } }, members: true } },
    },
  });
}

export async function createWorkspace(actor: Actor, raw: z.infer<typeof createWorkspaceSchema>) {
  const input = createWorkspaceSchema.parse(raw);

  let slug = slugify(input.name) || "workspace";
  const existing = await prisma.workspace.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        icon: input.icon ?? null,
        color: input.color ?? "#6366F1",
        createdById: actor.userId,
        members: {
          create: { userId: actor.userId, role: "OWNER" },
        },
      },
    });
    await recordActivity(tx, {
      workspaceId: ws.id,
      actorId: actor.userId,
      type: "workspace.created",
      metadata: { name: ws.name },
    });
    return ws;
  });
  return workspace;
}

export async function updateWorkspace(
  actor: Actor,
  workspaceId: string,
  raw: z.infer<typeof updateWorkspaceSchema>,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "workspace:manage");
  const input = updateWorkspaceSchema.parse(raw);

  const ws = await prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "workspace.updated",
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  });
  return ws;
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, avatarColor: true } },
    },
  });
}

export async function inviteMember(
  actor: Actor,
  workspaceId: string,
  raw: z.infer<typeof inviteMemberSchema>,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "invitation:manage");
  const input = inviteMemberSchema.parse(raw);

  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    throw new ServiceError("VALIDATION", "Invalid role for invitation.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const alreadyMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: existingUser.id } },
    });
    if (alreadyMember) throw new ServiceError("CONFLICT", "This person is already a member.");
  }

  // Re-invite semantics: supersede any pending invitation for the same email
  await prisma.invitation.updateMany({
    where: { workspaceId: ctx.workspaceId, email: input.email, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  const token = randomToken();
  const invitation = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        workspaceId: ctx.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: sha256Hex(token),
        invitedById: actor.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "member.invited",
      metadata: { email: input.email, role: input.role },
    });
    if (existingUser) {
      await notify(tx, {
        userId: existingUser.id,
        workspaceId: ctx.workspaceId,
        type: "invitation",
        title: `You're invited to ${ctx.name}`,
        body: `${actor.name} invited you as ${input.role}`,
        link: `/invitations/accept?token=${encodeURIComponent(token)}`,
        actorId: actor.userId,
      });
    }
    return inv;
  });

  await sendInvitationEmail(input.email, actor.name, ctx.name, input.role, token);
  return invitation;
}

export async function listInvitations(actor: Actor, workspaceId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "invitation:manage");
  return prisma.invitation.findMany({
    where: { workspaceId: ctx.workspaceId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { inviter: { select: { name: true, email: true } } },
  });
}

export async function revokeInvitation(actor: Actor, workspaceId: string, invitationId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "invitation:manage");

  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, workspaceId: ctx.workspaceId },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Invitation not found.");
  if (inv.status !== "PENDING") throw new ServiceError("CONFLICT", "Invitation is no longer pending.");

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "invitation.revoked",
      metadata: { email: inv.email },
    });
  });
}

export async function getInvitationByToken(token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      workspace: { select: { id: true, name: true, slug: true, color: true, icon: true } },
      inviter: { select: { name: true, email: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Invitation not found.");
  if (inv.status !== "PENDING") throw new ServiceError("CONFLICT", "This invitation is no longer valid.");
  if (inv.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    throw new ServiceError("CONFLICT", "This invitation has expired.");
  }
  return inv;
}

export async function acceptInvitation(actor: Actor, token: string) {
  const inv = await getInvitationByToken(token);
  if (inv.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new ServiceError("FORBIDDEN", "This invitation was sent to a different email address.");
  }

  const workspace = await prisma.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: actor.userId } },
    });
    if (!existing) {
      await tx.workspaceMember.create({
        data: { workspaceId: inv.workspaceId, userId: actor.userId, role: inv.role as Role },
      });
    }
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: actor.userId },
    });
    await recordActivity(tx, {
      workspaceId: inv.workspaceId,
      actorId: actor.userId,
      type: "member.joined",
      metadata: { role: inv.role },
    });
    return tx.workspace.findUniqueOrThrow({ where: { id: inv.workspaceId } });
  });
  return workspace;
}

export async function updateMemberRole(
  actor: Actor,
  workspaceId: string,
  raw: z.infer<typeof updateMemberRoleSchema>,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "member:manage");
  const input = updateMemberRoleSchema.parse(raw);

  const member = await prisma.workspaceMember.findFirst({
    where: { id: input.memberId, workspaceId: ctx.workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) throw new ServiceError("NOT_FOUND", "Member not found.");

  if (member.role === "OWNER") {
    throw new ServiceError("FORBIDDEN", "Use the ownership transfer flow to change the owner.");
  }
  // Admins cannot demote/modify other admins unless actor is owner... allow admins to manage non-admins only
  if (member.role === "ADMIN" && ctx.role !== "OWNER") {
    throw new ServiceError("FORBIDDEN", "Only the owner can change an admin's role.");
  }
  if (member.userId === actor.userId && ctx.role === "ADMIN" && input.role !== "ADMIN") {
    throw new ServiceError("FORBIDDEN", "You cannot demote yourself. Ask the owner.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({
      where: { id: member.id },
      data: { role: input.role },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "member.role_changed",
      metadata: { userId: member.userId, from: member.role, to: input.role },
    });
    await notify(tx, {
      userId: member.userId,
      workspaceId: ctx.workspaceId,
      type: "system",
      title: `Your role in ${ctx.name} is now ${input.role}`,
      link: `/${ctx.slug}/settings/members`,
      actorId: actor.userId,
    });
  });
}

export async function removeMember(actor: Actor, workspaceId: string, memberId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "member:manage");

  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: ctx.workspaceId },
  });
  if (!member) throw new ServiceError("NOT_FOUND", "Member not found.");
  if (member.role === "OWNER") throw new ServiceError("FORBIDDEN", "The owner cannot be removed.");
  if (member.role === "ADMIN" && ctx.role !== "OWNER") {
    throw new ServiceError("FORBIDDEN", "Only the owner can remove an admin.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.delete({ where: { id: member.id } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "member.removed",
      metadata: { userId: member.userId },
    });
  });
}

export async function transferOwnership(
  actor: Actor,
  workspaceId: string,
  raw: z.infer<typeof transferOwnershipSchema>,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  if (ctx.role !== "OWNER") {
    throw new ServiceError("FORBIDDEN", "Only the owner can transfer ownership.");
  }
  const input = transferOwnershipSchema.parse(raw);

  const target = await prisma.workspaceMember.findFirst({
    where: { id: input.memberId, workspaceId: ctx.workspaceId },
  });
  if (!target) throw new ServiceError("NOT_FOUND", "Member not found.");
  if (target.userId === actor.userId) throw new ServiceError("VALIDATION", "You already own this workspace.");

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({
      where: { id: target.id },
      data: { role: "OWNER" },
    });
    await tx.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: actor.userId } },
      data: { role: "ADMIN" },
    });
    await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: { createdById: target.userId },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorId: actor.userId,
      type: "ownership.transferred",
      metadata: { from: actor.userId, to: target.userId },
    });
  });
}

export async function listWorkspaceActivity(
  actor: Actor,
  workspaceId: string,
  opts: { limit?: number; projectId?: string } = {},
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceId);
  await requirePermission(ctx, "activity:view");
  return prisma.activity.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 30, 100),
    include: {
      actor: { select: { id: true, name: true, image: true, avatarColor: true } },
    },
  });
}

/** Returns the caller's role for UI affordances; server enforces regardless. */
export async function getWorkspaceContext(actor: Actor, slug: string): Promise<WorkspaceContext> {
  return requireWorkspaceMembership(actor, slug);
}

export function roleCan(role: Role, permission: Parameters<typeof can>[1]): boolean {
  return can(role, permission);
}

export { isAtLeast };
