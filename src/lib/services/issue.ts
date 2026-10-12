import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import {
  requireWorkspaceMembership,
  requireProjectAccess,
  requireIssueAccess,
} from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import {
  createIssueSchema,
  updateIssueSchema,
  duplicateIssueSchema,
  bulkIssueSchema,
  issueFilterSchema,
  moveIssueSchema,
} from "@/lib/validation";
import { recordActivity } from "@/lib/services/activity";
import { notifyMany, type NotificationType } from "@/lib/services/notifications";
import { realtimeBus } from "@/lib/realtime/bus";
import type { z } from "zod";
import type { BoardCategory, IssuePriority, IssueType, Prisma } from "@/generated/prisma/client";

const ISSUE_INCLUDE = {
  project: { select: { id: true, key: true, name: true, color: true, icon: true, workspace: { select: { slug: true } } } },
  sprint: { select: { id: true, name: true, status: true } },
  assignees: {
    include: { user: { select: { id: true, name: true, email: true, image: true, avatarColor: true } } },
  },
  labels: { include: { label: true } },
  reporter: { select: { id: true, name: true, image: true, avatarColor: true } },
  parentIssue: { select: { id: true, key: true, title: true, type: true } },
  _count: { select: { comments: true, subtasks: true, attachments: true } },
} satisfies Prisma.IssueInclude;

export type IssueWithRelations = Prisma.IssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

/**
 * Generate the next issue key for a project atomically.
 * `UPDATE ... RETURNING` serialises concurrent requests at the row level, so
 * keys stay unique even under parallel issue creation.
 */
async function nextIssueKey(tx: Prisma.TransactionClient, projectId: string, projectKey: string) {
  const rows = await tx.$queryRaw<Array<{ issueSequence: number }>>`
    UPDATE "Project" SET "issueSequence" = "issueSequence" + 1
    WHERE "id" = ${projectId}
    RETURNING "issueSequence"
  `;
  const seq = rows[0]?.issueSequence;
  if (typeof seq !== "number") throw new ServiceError("NOT_FOUND", "Project not found.");
  return { number: seq, key: `${projectKey}-${seq}` };
}

function categoryForStatus(columns: Array<{ key: string; category: BoardCategory }>, status: string): BoardCategory {
  return columns.find((c) => c.key === status)?.category ?? "BACKLOG";
}

export async function createIssue(actor: Actor, raw: z.infer<typeof createIssueSchema>) {
  const input = createIssueSchema.parse(raw);
  const { project, ctx } = await requireProjectAccess(actor, input.projectId, "issue:create");

  // Parent must belong to the same project and cannot be a subtask
  if (input.parentIssueId) {
    const parent = await prisma.issue.findFirst({
      where: { id: input.parentIssueId, projectId: project.id, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!parent) throw new ServiceError("VALIDATION", "Parent issue not found in this project.");
    if (parent.type === "SUBTASK") throw new ServiceError("VALIDATION", "Subtasks cannot have children.");
    if (input.type === "EPIC") throw new ServiceError("VALIDATION", "Epics cannot be subtasks.");
  }
  if (input.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: input.sprintId, projectId: project.id, status: { not: "COMPLETED" } },
    });
    if (!sprint) throw new ServiceError("VALIDATION", "Sprint not found or already completed.");
  }

  const columns = await prisma.boardColumn.findMany({
    where: { projectId: project.id },
    select: { key: true, category: true },
  });
  const status = input.status ?? "backlog";
  if (!columns.some((c) => c.key === status)) {
    throw new ServiceError("VALIDATION", `Unknown board column "${status}".`);
  }

  const issue = await prisma.$transaction(async (tx) => {
    const { number, key } = await nextIssueKey(tx, project.id, project.key);
    const created = await tx.issue.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        number,
        key,
        title: input.title,
        description: input.description ?? "",
        type: input.type ?? "TASK",
        status,
        statusCategory: categoryForStatus(columns, status),
        priority: input.priority ?? "MEDIUM",
        storyPoints: input.storyPoints ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        parentIssueId: input.parentIssueId ?? null,
        sprintId: input.sprintId ?? null,
        reporterId: actor.userId,
        createdById: actor.userId,
        rank: Date.now(),
        ...(input.assigneeIds?.length
          ? {
              assignees: {
                create: input.assigneeIds.map((userId) => ({
                  userId,
                  assignedById: actor.userId,
                })),
              },
            }
          : {}),
        ...(input.labelIds?.length
          ? { labels: { create: input.labelIds.map((labelId) => ({ labelId })) } }
          : {}),
      },
      include: ISSUE_INCLUDE,
    });

    if (input.sprintId) {
      await tx.sprintIssue.upsert({
        where: { sprintId_issueId: { sprintId: input.sprintId, issueId: created.id } },
        create: { sprintId: input.sprintId, issueId: created.id, addedById: actor.userId },
        update: { removedAt: null, addedById: actor.userId },
      });
    }

    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      issueId: created.id,
      actorId: actor.userId,
      type: "issue.created",
      metadata: { key, title: input.title, type: created.type },
    });

    // Notify assignees
    if (input.assigneeIds?.length) {
      await notifyMany(
        tx,
        input.assigneeIds
          .filter((id) => id !== actor.userId)
          .map((userId) => ({
            userId,
            workspaceId: ctx.workspaceId,
            type: "assignment" as NotificationType,
            title: `You were assigned to ${key}`,
            body: input.title,
            link: issueLink(ctx.slug, project.key, key),
            actorId: actor.userId,
            issueId: created.id,
          })),
      );
    }
    return created;
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: project.id },
    { type: "issue.created", payload: { issueId: issue.id, projectId: project.id, key: issue.key } },
  );
  return issue;
}

function issueLink(workspaceSlug: string, projectKey: string, issueKey: string): string {
  return `/app/${workspaceSlug}/projects/${projectKey}/issues/${issueKey}`;
}

export async function getIssueByKey(actor: Actor, workspaceIdOrSlug: string, issueKey: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const issue = await prisma.issue.findFirst({
    where: {
      key: issueKey.toUpperCase(),
      deletedAt: null,
      project: { workspaceId: ctx.workspaceId, deletedAt: null },
    },
    include: {
      ...ISSUE_INCLUDE,
      subtasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          statusCategory: true,
          priority: true,
          type: true,
          assignees: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
        },
        orderBy: { rank: "asc" },
      },
      dependencies: {
        include: {
          blocker: { select: { id: true, key: true, title: true, status: true, statusCategory: true } },
        },
      },
      blockers: {
        include: {
          issue: { select: { id: true, key: true, title: true, status: true, statusCategory: true } },
        },
      },
      references: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!issue) throw new ServiceError("NOT_FOUND", "Issue not found.");
  return { issue, ctx };
}

const FIELD_PERMISSIONS: Record<string, "issue:update" | "issue:update:restricted"> = {
  title: "issue:update",
  description: "issue:update",
  type: "issue:update",
  status: "issue:update:restricted",
  priority: "issue:update:restricted",
  storyPoints: "issue:update",
  startDate: "issue:update",
  dueDate: "issue:update",
  parentIssueId: "issue:update",
  assigneeIds: "issue:update:restricted",
  labelIds: "issue:update",
};

export async function updateIssue(
  actor: Actor,
  issueId: string,
  raw: z.infer<typeof updateIssueSchema>,
) {
  const input = updateIssueSchema.parse(raw);
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "issue:update:restricted");

  // Field-level RBAC: developers can change status/priority/assignees; editors can change the rest
  for (const field of Object.keys(input)) {
    const required = FIELD_PERMISSIONS[field];
    if (required && !can(ctx.role, required)) {
      throw new ServiceError("FORBIDDEN", `Your role cannot change "${field}".`);
    }
  }
  if (input.type === "EPIC" && input.parentIssueId) {
    throw new ServiceError("VALIDATION", "Epics cannot have a parent issue.");
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: issue.projectId },
    select: { key: true },
  });

  let columns: Array<{ key: string; category: BoardCategory }> | null = null;
  if (input.status && input.status !== issue.status) {
    columns = await prisma.boardColumn.findMany({
      where: { projectId: issue.projectId },
      select: { key: true, category: true },
    });
    if (!columns.some((c) => c.key === input.status)) {
      throw new ServiceError("VALIDATION", `Unknown board column "${input.status}".`);
    }
  }

  if (input.parentIssueId) {
    if (input.parentIssueId === issue.id) {
      throw new ServiceError("VALIDATION", "An issue cannot be its own parent.");
    }
    const parent = await prisma.issue.findFirst({
      where: { id: input.parentIssueId, projectId: issue.projectId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!parent) throw new ServiceError("VALIDATION", "Parent issue not found in this project.");
    if (parent.type === "SUBTASK") throw new ServiceError("VALIDATION", "Subtasks cannot have children.");
  }

  const statusChanged = !!input.status && input.status !== issue.status;

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.IssueUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.type !== undefined) data.type = input.type as IssueType;
    if (input.status !== undefined) {
      data.status = input.status;
      if (columns) data.statusCategory = categoryForStatus(columns, input.status);
    }
    if (input.priority !== undefined) data.priority = input.priority as IssuePriority;
    if (input.storyPoints !== undefined) data.storyPoints = input.storyPoints;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.parentIssueId !== undefined) data.parentIssue = input.parentIssueId ? { connect: { id: input.parentIssueId } } : { disconnect: true };
    if (input.sprintId !== undefined) {
      if (input.sprintId) {
        const sprint = await tx.sprint.findFirst({
          where: { id: input.sprintId, projectId: issue.projectId },
          select: { id: true },
        });
        if (!sprint) throw new ServiceError("VALIDATION", "Sprint not found in this project.");
        data.sprint = { connect: { id: sprint.id } };
      } else {
        data.sprint = { disconnect: true };
      }
    }

    if (input.assigneeIds) {
      const current = await tx.issueAssignee.findMany({ where: { issueId: issue.id } });
      const currentIds = new Set(current.map((a) => a.userId));
      const nextIds = new Set(input.assigneeIds);
      const removed = [...currentIds].filter((id) => !nextIds.has(id));
      const added = [...nextIds].filter((id) => !currentIds.has(id));

      // Assignees must be workspace members
      if (added.length) {
        const members = await tx.workspaceMember.count({
          where: { workspaceId: ctx.workspaceId, userId: { in: added } },
        });
        if (members !== added.length) {
          throw new ServiceError("VALIDATION", "Assignees must be workspace members.");
        }
      }
      if (removed.length) {
        await tx.issueAssignee.deleteMany({
          where: { issueId: issue.id, userId: { in: removed } },
        });
      }
      if (added.length) {
        await tx.issueAssignee.createMany({
          data: added.map((userId) => ({ issueId: issue.id, userId, assignedById: actor.userId })),
        });
      }
    }

    if (input.labelIds) {
      const labels = await tx.label.findMany({
        where: {
          id: { in: input.labelIds },
          workspaceId: ctx.workspaceId,
          OR: [{ projectId: issue.projectId }, { projectId: null }],
        },
        select: { id: true },
      });
      if (labels.length !== input.labelIds.length) {
        throw new ServiceError("VALIDATION", "One or more labels are invalid for this project.");
      }
      await tx.issueLabel.deleteMany({ where: { issueId: issue.id } });
      await tx.issueLabel.createMany({
        data: input.labelIds.map((labelId) => ({ issueId: issue.id, labelId })),
        skipDuplicates: true,
      });
    }

    const result = await tx.issue.update({
      where: { id: issue.id },
      data,
      include: ISSUE_INCLUDE,
    });

    const changedFields = Object.keys(input);
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.userId,
      type: statusChanged ? "issue.status_changed" : "issue.updated",
      metadata: {
        key: issue.key,
        fields: changedFields,
        ...(statusChanged ? { from: issue.status, to: input.status } : {}),
      },
    });

    if (statusChanged) {
      await notifyMany(
        tx,
        (await tx.issueAssignee.findMany({ where: { issueId: issue.id } }))
          .map((a) => a.userId)
          .filter((id) => id !== actor.userId)
          .map((userId) => ({
            userId,
            workspaceId: ctx.workspaceId,
            type: "status_change" as NotificationType,
            title: `${issue.key} moved to ${input.status?.replace(/_/g, " ")}`,
            body: issue.title,
            link: issueLink(ctx.slug, project.key, issue.key),
            actorId: actor.userId,
            issueId: issue.id,
          })),
      );
    }

    if (input.assigneeIds) {
      await notifyMany(
        tx,
        input.assigneeIds
          .filter((id) => id !== actor.userId)
          .map((userId) => ({
            userId,
            workspaceId: ctx.workspaceId,
            type: "assignment" as NotificationType,
            title: `You were assigned to ${issue.key}`,
            body: issue.title,
            link: issueLink(ctx.slug, project.key, issue.key),
            actorId: actor.userId,
            issueId: issue.id,
          })),
      );
    }
    return result;
  });

  if (statusChanged) {
    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId: issue.projectId },
      { type: "issue.moved", payload: { issueId: issue.id, projectId: issue.projectId, key: issue.key, status: input.status! } },
    );
  } else {
    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId: issue.projectId },
      { type: "issue.updated", payload: { issueId: issue.id, projectId: issue.projectId, key: issue.key, fields: Object.keys(input) } },
    );
  }
  return updated;
}

export async function deleteIssue(actor: Actor, issueId: string) {
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "issue:delete");
  await prisma.$transaction(async (tx) => {
    await tx.issue.update({ where: { id: issue.id }, data: { deletedAt: new Date() } });
    // Cascade soft-delete to subtasks
    await tx.issue.updateMany({
      where: { parentIssueId: issue.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.userId,
      type: "issue.deleted",
      metadata: { key: issue.key },
    });
  });
  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: issue.projectId },
    { type: "issue.deleted", payload: { issueId: issue.id, projectId: issue.projectId, key: issue.key } },
  );
}

export async function duplicateIssue(actor: Actor, raw: z.infer<typeof duplicateIssueSchema>) {
  const input = duplicateIssueSchema.parse(raw);
  const { issue, ctx } = await requireIssueAccess(actor, input.issueId, "issue:create");

  const source = await prisma.issue.findUniqueOrThrow({
    where: { id: issue.id },
    include: { assignees: true, labels: true },
  });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: source.projectId },
    select: { key: true },
  });

  const copy = await prisma.$transaction(async (tx) => {
    const { number, key } = await nextIssueKey(tx, source.projectId, project.key);
    const created = await tx.issue.create({
      data: {
        workspaceId: source.workspaceId,
        projectId: source.projectId,
        number,
        key,
        title: input.title ?? `${source.title} (copy)`,
        description: source.description,
        type: source.type,
        status: source.status,
        statusCategory: source.statusCategory,
        priority: source.priority,
        storyPoints: source.storyPoints,
        startDate: source.startDate,
        dueDate: source.dueDate,
        parentIssueId: source.parentIssueId,
        sprintId: source.sprintId,
        reporterId: actor.userId,
        createdById: actor.userId,
        rank: Date.now(),
        assignees: {
          create: source.assignees.map((a) => ({ userId: a.userId, assignedById: actor.userId })),
        },
        labels: { create: source.labels.map((l) => ({ labelId: l.labelId })) },
      },
      include: ISSUE_INCLUDE,
    });
    await recordActivity(tx, {
      workspaceId: source.workspaceId,
      projectId: source.projectId,
      issueId: created.id,
      actorId: actor.userId,
      type: "issue.duplicated",
      metadata: { from: source.key, key },
    });
    return created;
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: source.projectId },
    { type: "issue.created", payload: { issueId: copy.id, projectId: source.projectId, key: copy.key } },
  );
  return copy;
}

export type IssueQuery = z.infer<typeof issueFilterSchema>;

function buildIssueWhere(ctxWorkspaceId: string, filter: IssueQuery, selfUserId: string): Prisma.IssueWhereInput {
  const and: Prisma.IssueWhereInput[] = [{ deletedAt: null, workspaceId: ctxWorkspaceId }];

  if (filter.projectId) and.push({ projectId: filter.projectId });

  const q = filter.q?.trim();
  if (q) {
    const asKey = q.toUpperCase();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { key: { contains: asKey, mode: "insensitive" } },
      ],
    });
  }

  const asArray = (v: unknown): string[] => {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v.map((x) => String(x)) : [String(v)];
  };

  const status = asArray(filter.status);
  if (status.length) and.push({ status: { in: status } });

  const priority = asArray(filter.priority);
  if (priority.length) and.push({ priority: { in: priority as IssuePriority[] } });

  const type = asArray(filter.type);
  if (type.length) and.push({ type: { in: type as IssueType[] } });

  const assignee = asArray(filter.assigneeId);
  if (assignee.length) {
    const ors: Prisma.IssueWhereInput[] = [];
    for (const a of assignee) {
      if (a === "unassigned") ors.push({ assignees: { none: {} } });
      else if (a === "me") ors.push({ assignees: { some: { userId: selfUserId } } });
      else ors.push({ assignees: { some: { userId: a } } });
    }
    if (ors.length) and.push({ OR: ors });
  }

  const labelIds = asArray(filter.labelId);
  if (labelIds.length) and.push({ labels: { some: { labelId: { in: labelIds } } } });

  const sprintIds = asArray(filter.sprintId);
  if (sprintIds.length) {
    const ors: Prisma.IssueWhereInput[] = [];
    for (const s of sprintIds) {
      if (s === "none") ors.push({ sprintId: null });
      else ors.push({ sprintId: s });
    }
    and.push({ OR: ors });
  }

  if (filter.parentId === "none") and.push({ parentIssueId: null });
  else if (filter.parentId && typeof filter.parentId === "string") and.push({ parentIssueId: filter.parentId });

  if (filter.overdue) {
    and.push({ dueDate: { lt: new Date() }, statusCategory: { not: "DONE" } });
  }
  if (filter.dueBefore) and.push({ dueDate: { lte: filter.dueBefore } });
  if (filter.dueAfter) and.push({ dueDate: { gte: filter.dueAfter } });

  const includeDone = filter.includeDone === true || (filter.status !== undefined && asArray(filter.status).length > 0);
  if (!includeDone) {
    // default: hide completed work unless explicitly requested
    and.push({ statusCategory: { not: "DONE" } });
  }

  return { AND: and };
}

export async function listIssuesInWorkspace(
  actor: Actor,
  workspaceIdOrSlug: string,
  rawFilter: IssueQuery,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const filter = issueFilterSchema.parse(rawFilter);
  const where = buildIssueWhere(ctx.workspaceId, filter, actor.userId);
  return runIssueQuery(where, filter);
}

async function runIssueQuery(where: Prisma.IssueWhereInput, filter: IssueQuery) {
  const sortField = filter.sort ?? "updatedAt";
  const dir = filter.dir ?? "desc";
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;

  let orderBy: Prisma.IssueOrderByWithRelationInput[];
  if (sortField === "priority") {
    orderBy = [{ priority: dir }, { updatedAt: "desc" }];
  } else if (sortField === "key") {
    orderBy = [{ projectId: "asc" }, { number: dir }];
  } else if (sortField === "dueDate") {
    orderBy = [{ dueDate: dir }, { updatedAt: "desc" }];
  } else if (sortField === "rank") {
    orderBy = [{ rank: dir }];
  } else if (sortField === "createdAt") {
    orderBy = [{ createdAt: dir }];
  } else {
    orderBy = [{ updatedAt: dir }];
  }

  const [items, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: ISSUE_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.issue.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Board view: issues grouped by status with ordering preserved. */
export async function getBoard(
  actor: Actor,
  workspaceIdOrSlug: string,
  projectKey: string,
  filter: IssueQuery = {},
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const project = await prisma.project.findFirst({
    where: { workspaceId: ctx.workspaceId, key: projectKey.toUpperCase(), deletedAt: null },
    select: { id: true, key: true, name: true, color: true, icon: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Project not found.");

  const columns = await prisma.boardColumn.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
  });

  const where = buildIssueWhere(
    ctx.workspaceId,
    { ...filter, projectId: project.id, includeDone: true },
    actor.userId,
  );
  const issues = await prisma.issue.findMany({
    where,
    include: ISSUE_INCLUDE,
    orderBy: [{ rank: "asc" }],
    take: 2000,
  });

  const grouped: Record<string, IssueWithRelations[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const issue of issues) {
    (grouped[issue.status] ??= []).push(issue);
  }
  return { project, columns, grouped, total: issues.length };
}

function midRank(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1024;
  if (after === null) return (before as number) + 1024;
  return ((before as number) + (after as number)) / 2;
}

/** Persist a drag-and-drop move (status + ordering) with revalidation on write. */
export async function moveIssue(actor: Actor, raw: z.infer<typeof moveIssueSchema>) {
  const input = moveIssueSchema.parse(raw);
  const { issue, ctx } = await requireIssueAccess(actor, input.issueId, "issue:update:restricted");
  if (!can(ctx.role, "issue:update:restricted")) {
    throw new ServiceError("FORBIDDEN", "Your role cannot move issues.");
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: issue.projectId },
    select: { key: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const columns = await tx.boardColumn.findMany({
      where: { projectId: issue.projectId },
      select: { key: true, category: true },
    });
    const column = columns.find((c) => c.key === input.status);
    if (!column) throw new ServiceError("VALIDATION", `Unknown board column "${input.status}".`);

    let rank: number;
    const neighbors = await tx.issue.findMany({
      where: {
        projectId: issue.projectId,
        deletedAt: null,
        status: input.status,
        id: { not: issue.id },
      },
      select: { id: true, rank: true },
    });
    const before = input.afterId ? neighbors.find((n) => n.id === input.afterId) : undefined;
    const after = input.beforeId ? neighbors.find((n) => n.id === input.beforeId) : undefined;

    if (!input.afterId && !input.beforeId) {
      const maxRank = neighbors.reduce((m, n) => Math.max(m, n.rank), -Infinity);
      rank = neighbors.length === 0 ? 0 : maxRank + 1024;
    } else {
      rank = midRank(before?.rank ?? null, after?.rank ?? null);
    }

    const statusChanged = issue.status !== input.status;
    const result = await tx.issue.update({
      where: { id: issue.id },
      data: {
        status: input.status,
        statusCategory: column.category,
        rank,
      },
      include: ISSUE_INCLUDE,
    });

    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.userId,
      type: statusChanged ? "issue.status_changed" : "issue.moved",
      metadata: { key: issue.key, from: issue.status, to: input.status, rank },
    });

    if (statusChanged) {
      const assignees = await tx.issueAssignee.findMany({
        where: { issueId: issue.id },
        select: { userId: true },
      });
      await notifyMany(
        tx,
        assignees
          .map((a) => a.userId)
          .filter((userId) => userId !== actor.userId)
          .map((userId) => ({
            userId,
            workspaceId: ctx.workspaceId,
            type: "status_change" as NotificationType,
            title: `${issue.key} moved to ${input.status.replace(/_/g, " ")}`,
            body: issue.title,
            link: issueLink(ctx.slug, project.key, issue.key),
            actorId: actor.userId,
            issueId: issue.id,
          })),
      );
    }
    return result;
  });

  realtimeBus.publish(
    { workspaceId: ctx.workspaceId, projectId: issue.projectId },
    {
      type: "issue.moved",
      payload: { issueId: issue.id, projectId: issue.projectId, key: issue.key, status: input.status },
    },
  );
  return updated;
}

export async function bulkUpdateIssues(
  actor: Actor,
  workspaceIdOrSlug: string,
  raw: z.infer<typeof bulkIssueSchema>,
) {
  const input = bulkIssueSchema.parse(raw);
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);

  const issues = await prisma.issue.findMany({
    where: { id: { in: input.issueIds }, deletedAt: null, workspaceId: ctx.workspaceId },
    select: { id: true, key: true, projectId: true, title: true, status: true },
  });
  if (issues.length !== input.issueIds.length) {
    throw new ServiceError("VALIDATION", "Some issues were not found in this workspace.");
  }

  const requiresDelete = input.action === "delete";
  const perm = requiresDelete ? "issue:delete" : "issue:update:restricted";
  if (!can(ctx.role, perm)) {
    throw new ServiceError("FORBIDDEN", `Your role cannot perform "${input.action}".`);
  }
  if (["setStatus", "addLabel", "removeLabel", "addToSprint", "removeFromSprint"].includes(input.action) && !can(ctx.role, "issue:update:restricted")) {
    throw new ServiceError("FORBIDDEN", "Your role cannot perform this bulk action.");
  }

  const results: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const issue of issues) {
      switch (input.action) {
        case "assign": {
          const userIds = Array.isArray(input.payload.userIds) ? (input.payload.userIds as string[]) : [];
          for (const userId of userIds) {
            await tx.issueAssignee.upsert({
              where: { issueId_userId: { issueId: issue.id, userId } },
              create: { issueId: issue.id, userId, assignedById: actor.userId },
              update: {},
            });
          }
          break;
        }
        case "unassign": {
          const userIds = Array.isArray(input.payload.userIds) ? (input.payload.userIds as string[]) : [];
          await tx.issueAssignee.deleteMany({
            where: { issueId: issue.id, ...(userIds.length ? { userId: { in: userIds } } : {}) },
          });
          break;
        }
        case "setPriority": {
          await tx.issue.update({
            where: { id: issue.id },
            data: { priority: input.payload.priority as IssuePriority },
          });
          break;
        }
        case "setStatus": {
          const columns = await tx.boardColumn.findMany({
            where: { projectId: issue.projectId },
            select: { key: true, category: true },
          });
          const status = String(input.payload.status);
          const col = columns.find((c) => c.key === status);
          if (!col) throw new ServiceError("VALIDATION", `Unknown column "${status}".`);
          await tx.issue.update({
            where: { id: issue.id },
            data: { status, statusCategory: col.category },
          });
          break;
        }
        case "setType": {
          await tx.issue.update({
            where: { id: issue.id },
            data: { type: input.payload.type as IssueType },
          });
          break;
        }
        case "addLabel": {
          await tx.issueLabel.upsert({
            where: { issueId_labelId: { issueId: issue.id, labelId: String(input.payload.labelId) } },
            create: { issueId: issue.id, labelId: String(input.payload.labelId) },
            update: {},
          });
          break;
        }
        case "removeLabel": {
          await tx.issueLabel.deleteMany({
            where: { issueId: issue.id, labelId: String(input.payload.labelId) },
          });
          break;
        }
        case "addToSprint": {
          const sprintId = String(input.payload.sprintId);
          const sprint = await tx.sprint.findFirst({
            where: { id: sprintId, status: { not: "COMPLETED" } },
            select: { id: true, projectId: true },
          });
          if (!sprint || sprint.projectId !== issue.projectId) {
            throw new ServiceError("VALIDATION", "Sprint not found for this project.");
          }
          await tx.issue.update({ where: { id: issue.id }, data: { sprintId } });
          await tx.sprintIssue.upsert({
            where: { sprintId_issueId: { sprintId, issueId: issue.id } },
            create: { sprintId, issueId: issue.id, addedById: actor.userId },
            update: { removedAt: null },
          });
          break;
        }
        case "removeFromSprint": {
          await tx.issue.update({ where: { id: issue.id }, data: { sprintId: null } });
          await tx.sprintIssue.updateMany({
            where: { issueId: issue.id, removedAt: null },
            data: { removedAt: new Date() },
          });
          break;
        }
        case "delete": {
          await tx.issue.update({ where: { id: issue.id }, data: { deletedAt: new Date() } });
          break;
        }
      }
      await recordActivity(tx, {
        workspaceId: ctx.workspaceId,
        projectId: issue.projectId,
        issueId: issue.id,
        actorId: actor.userId,
        type: input.action === "delete"
          ? "issue.deleted"
          : input.action === "setStatus"
            ? "issue.status_changed"
            : "issue.updated",
        metadata: {
          key: issue.key,
          bulk: input.action,
          ...(input.action === "setStatus" ? { from: issue.status, to: (input.payload as { status?: string }).status } : {}),
          payload: input.payload as Record<string, unknown>,
        },
      });
      results.push(issue.id);
    }
  });

  const projectIds = [...new Set(issues.map((i) => i.projectId))];
  for (const projectId of projectIds) {
    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId },
      { type: "issue.bulk_updated", payload: { projectId, issueIds: results } },
    );
  }
  return { updated: results.length, issueIds: results };
}

// ── Dependencies ────────────────────────────────────────────────────────────

export async function addDependency(
  actor: Actor,
  issueId: string,
  blockerId: string,
  type: "BLOCKS" | "RELATES" | "DUPLICATES" = "BLOCKS",
) {
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "issue:update");
  if (issueId === blockerId) throw new ServiceError("VALIDATION", "An issue cannot block itself.");
  const blocker = await prisma.issue.findFirst({
    where: { id: blockerId, workspaceId: ctx.workspaceId, deletedAt: null },
    select: { id: true, key: true, projectId: true },
  });
  if (!blocker) throw new ServiceError("NOT_FOUND", "Blocking issue not found.");

  try {
    return await prisma.$transaction(async (tx) => {
      const dep = await tx.issueDependency.create({
        data: { issueId, blockerId, type },
        include: {
          blocker: { select: { id: true, key: true, title: true, status: true, statusCategory: true } },
        },
      });
      await recordActivity(tx, {
        workspaceId: ctx.workspaceId,
        projectId: issue.projectId,
        issueId,
        actorId: actor.userId,
        type: "issue.updated",
        metadata: { key: issue.key, dependencyAdded: blocker.key, type },
      });
      return dep;
    });
  } catch (err) {
    if (String(err).includes("Unique constraint")) {
      throw new ServiceError("CONFLICT", "This dependency already exists.");
    }
    throw err;
  }
}

export async function removeDependency(actor: Actor, issueId: string, dependencyId: string) {
  const { issue, ctx } = await requireIssueAccess(actor, issueId, "issue:update");
  const dep = await prisma.issueDependency.findFirst({
    where: { id: dependencyId, issueId },
  });
  if (!dep) throw new ServiceError("NOT_FOUND", "Dependency not found.");
  await prisma.$transaction(async (tx) => {
    await tx.issueDependency.delete({ where: { id: dep.id } });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: issue.projectId,
      issueId,
      actorId: actor.userId,
      type: "issue.updated",
      metadata: { key: issue.key, dependencyRemoved: dep.blockerId },
    });
  });
}

/** Issues assigned to the signed-in user across the workspace. */
export async function myIssues(actor: Actor, workspaceIdOrSlug: string, opts: { includeDone?: boolean } = {}) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  return prisma.issue.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      assignees: { some: { userId: actor.userId } },
      ...(opts.includeDone ? {} : { statusCategory: { not: "DONE" } }),
    },
    include: ISSUE_INCLUDE,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 200,
  });
}
