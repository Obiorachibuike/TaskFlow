import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission } from "@/lib/auth/guards";
import {
  createProjectSchema,
  updateProjectSchema,
  createLabelSchema,
  createMilestoneSchema,
} from "@/lib/validation";
import { projectKeyFrom } from "@/lib/utils";
import { recordActivity } from "@/lib/services/activity";
import type { BoardCategory, Prisma } from "@/generated/prisma/client";

export const DEFAULT_BOARD_COLUMNS: Array<{ key: string; name: string; category: BoardCategory }> = [
  { key: "backlog", name: "Backlog", category: "BACKLOG" },
  { key: "todo", name: "To Do", category: "TODO" },
  { key: "in_progress", name: "In Progress", category: "IN_PROGRESS" },
  { key: "in_review", name: "In Review", category: "IN_REVIEW" },
  { key: "done", name: "Done", category: "DONE" },
];

export async function listProjects(actor: Actor, workspaceIdOrSlug: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  return prisma.project.findMany({
    where: { workspaceId: ctx.workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      lead: { select: { id: true, name: true, image: true, avatarColor: true } },
      _count: {
        select: {
          issues: { where: { deletedAt: null } },
          members: true,
        },
      },
    },
  });
}

export async function createProject(actor: Actor, workspaceIdOrSlug: string, raw: z.infer<typeof createProjectSchema>) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "project:create");
  const input = createProjectSchema.parse(raw);

  if (input.leadId) {
    const lead = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: input.leadId } },
    });
    if (!lead) throw new ServiceError("VALIDATION", "Project lead must be a workspace member.");
  }

  const existingKeys = await prisma.project.findMany({
    where: { workspaceId: ctx.workspaceId, deletedAt: null },
    select: { key: true },
  });
  const keySet = new Set(existingKeys.map((p) => p.key));
  const key = input.key ?? projectKeyFrom(input.name, keySet);
  if (keySet.has(key)) {
    throw new ServiceError("CONFLICT", `Project key ${key} is already in use in this workspace.`);
  }

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        workspaceId: ctx.workspaceId,
        key,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        color: input.color ?? "#6366F1",
        status: input.status ?? "ACTIVE",
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        leadId: input.leadId ?? null,
        createdById: actor.userId,
        members: {
          create: { userId: actor.userId, role: "PROJECT_MANAGER" },
        },
        boardColumns: {
          create: DEFAULT_BOARD_COLUMNS.map((c, i) => ({
            workspaceId: ctx.workspaceId,
            key: c.key,
            name: c.name,
            category: c.category,
            position: i,
          })),
        },
      },
      include: { boardColumns: { orderBy: { position: "asc" } } },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: p.id,
      actorId: actor.userId,
      type: "project.created",
      metadata: { name: p.name, key: p.key },
    });
    return p;
  });
  return project;
}

export async function getProjectByKey(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const project = await prisma.project.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      key: projectKey.toUpperCase(),
      deletedAt: null,
    },
    include: {
      lead: { select: { id: true, name: true, image: true, avatarColor: true } },
      boardColumns: { orderBy: { position: "asc" } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true, avatarColor: true } } },
      },
    },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Project not found.");
  return { project, ctx };
}

export async function updateProject(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  raw: z.infer<typeof updateProjectSchema>,
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:manage");
  const input = updateProjectSchema.parse(raw);

  if (input.key && input.key !== project.key) {
    const taken = await prisma.project.findFirst({
      where: { workspaceId: ctx.workspaceId, key: input.key, deletedAt: null, NOT: { id: project.id } },
    });
    if (taken) throw new ServiceError("CONFLICT", `Project key ${input.key} is already in use.`);
  }
  if (input.leadId) {
    const lead = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: input.leadId } },
    });
    if (!lead) throw new ServiceError("VALIDATION", "Project lead must be a workspace member.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: project.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      actorId: actor.userId,
      type: "project.updated",
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  });
}

export async function archiveProject(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:delete");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date() },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      actorId: actor.userId,
      type: "project.archived",
      metadata: { key: project.key },
    });
    return updated;
  });
}

/** Delete project permanently — restricted to workspace OWNER/ADMIN. */
export async function deleteProject(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:delete");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new ServiceError("FORBIDDEN", "Only owners and admins can delete projects permanently.");
  }
  await prisma.project.delete({ where: { id: project.id } });
}

export async function projectMembers(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    include: { user: { select: { id: true, name: true, email: true, image: true, avatarColor: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { members, workspaceMembers: await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { user: { select: { id: true, name: true, email: true, image: true, avatarColor: true } } },
  }) };
}

export async function addProjectMember(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  userId: string,
  role: "PROJECT_MANAGER" | "DEVELOPER" | "VIEWER" = "DEVELOPER",
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:manage");
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId } },
  });
  if (!member) throw new ServiceError("VALIDATION", "User must be a workspace member first.");
  return prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: { projectId: project.id, userId, role },
    update: { role },
  });
}

export async function removeProjectMember(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  userId: string,
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:manage");
  await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId } });
}

// ── Labels ──────────────────────────────────────────────────────────────────

export async function listLabels(actor: Actor, workspaceIdOrSlug: string, projectId?: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  return prisma.label.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : { projectId: null }),
    },
    orderBy: { name: "asc" },
  });
}

export async function createLabel(actor: Actor, workspaceIdOrSlug: string, raw: z.infer<typeof createLabelSchema>) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "label:manage");
  const input = createLabelSchema.parse(raw);

  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, workspaceId: ctx.workspaceId, deletedAt: null },
    });
    if (!project) throw new ServiceError("NOT_FOUND", "Project not found.");
  }
  try {
    const label = await prisma.$transaction(async (tx) => {
      const l = await tx.label.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: input.projectId ?? null,
          name: input.name,
          color: input.color ?? "#6366F1",
        },
      });
      await recordActivity(tx, {
        workspaceId: ctx.workspaceId,
        projectId: input.projectId ?? null,
        actorId: actor.userId,
        type: "label.created",
        metadata: { name: l.name },
      });
      return l;
    });
    return label;
  } catch (err) {
    if (String(err).includes("Unique constraint")) {
      throw new ServiceError("CONFLICT", "A label with this name already exists.");
    }
    throw err;
  }
}

export async function deleteLabel(actor: Actor, workspaceIdOrSlug: string, labelId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "label:manage");
  const label = await prisma.label.findFirst({
    where: { id: labelId, workspaceId: ctx.workspaceId },
  });
  if (!label) throw new ServiceError("NOT_FOUND", "Label not found.");
  await prisma.$transaction(async (tx) => {
    await tx.label.delete({ where: { id: label.id } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: label.projectId,
      actorId: actor.userId,
      type: "label.deleted",
      metadata: { name: label.name },
    });
  });
}

// ── Milestones ──────────────────────────────────────────────────────────────

export async function listMilestones(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const { project } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  return prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { date: "asc" },
  });
}

export async function createMilestone(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  raw: z.infer<typeof createMilestoneSchema>,
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "project:manage");
  const input = createMilestoneSchema.parse({ ...raw, projectId: project.id });
  return prisma.milestone.create({
    data: {
      projectId: project.id,
      name: input.name,
      description: input.description ?? null,
      date: input.date,
    },
  });
}

export async function deleteMilestone(actor: Actor, workspaceIdOrSlug: string, milestoneId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "project:manage");
  const m = await prisma.milestone.findFirst({
    where: { id: milestoneId, project: { workspaceId: ctx.workspaceId } },
  });
  if (!m) throw new ServiceError("NOT_FOUND", "Milestone not found.");
  await prisma.milestone.delete({ where: { id: m.id } });
}

// ── Board columns ───────────────────────────────────────────────────────────

export async function listBoardColumns(actor: Actor, workspaceIdOrSlug: string, projectKey: string) {
  const { project } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  return prisma.boardColumn.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
  });
}

export async function createBoardColumn(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  raw: { name: string; key: string; category: BoardCategory; color?: string },
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "board:manage");
  const input = createBoardColumnSchemaInner.parse(raw);
  const max = await prisma.boardColumn.aggregate({
    where: { projectId: project.id },
    _max: { position: true },
  });
  try {
    return await prisma.boardColumn.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        key: input.key,
        name: input.name,
        category: input.category,
        color: input.color ?? null,
        position: (max._max.position ?? -1) + 1,
      },
    });
  } catch (err) {
    if (String(err).includes("Unique constraint")) {
      throw new ServiceError("CONFLICT", "A column with this key already exists.");
    }
    throw err;
  }
}

const createBoardColumnSchemaInner = z.object({
  name: z.string().trim().min(1).max(60),
  key: z.string().trim().toLowerCase().min(1).max(32).regex(/^[a-z0-9_-]+$/),
  category: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function updateBoardColumn(
  actor: Actor,
  workspaceIdOrSlug: string,
  columnId: string,
  raw: { name?: string; color?: string | null; category?: BoardCategory },
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "board:manage");
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, workspaceId: ctx.workspaceId },
  });
  if (!column) throw new ServiceError("NOT_FOUND", "Column not found.");
  return prisma.boardColumn.update({
    where: { id: column.id },
    data: {
      ...(raw.name !== undefined ? { name: raw.name } : {}),
      ...(raw.color !== undefined ? { color: raw.color } : {}),
      ...(raw.category !== undefined ? { category: raw.category } : {}),
    },
  });
}

export async function reorderBoardColumns(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  orderedIds: string[],
) {
  const { project, ctx } = await getProjectByKey(actor, workspaceIdOrSlug, projectKey);
  await requirePermission(ctx, "board:manage");
  const columns = await prisma.boardColumn.findMany({ where: { projectId: project.id } });
  const idSet = new Set(columns.map((c) => c.id));
  if (orderedIds.length !== columns.length || orderedIds.some((id) => !idSet.has(id))) {
    throw new ServiceError("VALIDATION", "orderedIds must contain exactly the project's columns.");
  }
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.boardColumn.update({ where: { id }, data: { position: index } }),
    ),
  );
  return prisma.boardColumn.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } });
}

export async function deleteBoardColumn(actor: Actor, workspaceIdOrSlug: string, columnId: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "board:manage");
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, workspaceId: ctx.workspaceId },
  });
  if (!column) throw new ServiceError("NOT_FOUND", "Column not found.");
  const count = await prisma.issue.count({
    where: { projectId: column.projectId, status: column.key, deletedAt: null },
  });
  if (count > 0) {
    throw new ServiceError("CONFLICT", `Move or resolve the ${count} issue(s) in this column first.`);
  }
  if (["backlog", "todo", "in_progress", "in_review", "done"].includes(column.key)) {
    throw new ServiceError("CONFLICT", "Default workflow columns cannot be deleted.");
  }
  await prisma.boardColumn.delete({ where: { id: column.id } });
}

// ── Project metrics ─────────────────────────────────────────────────────────

export interface ProjectMetrics {
  totalIssues: number;
  doneIssues: number;
  openIssues: number;
  overdueIssues: number;
  completionPct: number;
  storyPointsTotal: number;
  storyPointsDone: number;
  byStatusCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export async function projectMetrics(projectId: string): Promise<ProjectMetrics> {
  const issues = await prisma.issue.findMany({
    where: { projectId, deletedAt: null },
    select: { statusCategory: true, priority: true, type: true, storyPoints: true, dueDate: true },
    take: 5000,
  });
  const byStatusCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let done = 0;
  let overdue = 0;
  let spTotal = 0;
  let spDone = 0;
  const now = Date.now();
  for (const i of issues) {
    byStatusCategory[i.statusCategory] = (byStatusCategory[i.statusCategory] ?? 0) + 1;
    byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
    byType[i.type] = (byType[i.type] ?? 0) + 1;
    if (i.statusCategory === "DONE") done++;
    else if (i.dueDate && i.dueDate.getTime() < now) overdue++;
    if (i.storyPoints != null) {
      spTotal += i.storyPoints;
      if (i.statusCategory === "DONE") spDone += i.storyPoints;
    }
  }
  const total = issues.length;
  return {
    totalIssues: total,
    doneIssues: done,
    openIssues: total - done,
    overdueIssues: overdue,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    storyPointsTotal: spTotal,
    storyPointsDone: spDone,
    byStatusCategory,
    byPriority,
    byType,
  };
}

export type ProjectWithIncludes = Prisma.ProjectGetPayload<Record<string, never>>;
