/**
 * Sprint lifecycle + agile metrics.
 *
 * Metric definitions (also documented in docs/METRICS.md):
 * - Sprint scope  = issues currently linked to the sprint (Issue.sprintId) plus
 *   history rows (SprintIssue) for issues that were part of the sprint.
 * - Burndown      = for each day, the number of scoped issues that were NOT in a
 *   DONE board category at the end of that day. Reconstructed from Activity
 *   events (issue.created / issue.status_changed) replayed from sprint start.
 * - Ideal line    = linear from initial scope to 0 across the sprint's days.
 * - Velocity      = story points of issues in the sprint that were DONE at
 *   completion time (snapshotted into the completion activity metadata).
 */
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission, requireProjectAccess } from "@/lib/auth/guards";
import { createSprintSchema, updateSprintSchema, sprintIssuesSchema, completeSprintSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/services/activity";
import { realtimeBus } from "@/lib/realtime/bus";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listSprints(actor: Actor, workspaceIdOrSlug: string, projectKey?: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  return prisma.sprint.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(projectKey
        ? { project: { key: projectKey.toUpperCase(), deletedAt: null } }
        : { project: { deletedAt: null } }),
    },
    include: {
      project: { select: { id: true, key: true, name: true, color: true } },
      _count: {
        select: {
          issues: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
}

export async function getSprint(actor: Actor, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, project: { deletedAt: null } },
    include: {
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          workspaceId: true,
          workspace: { select: { slug: true } },
        },
      },
      issues: {
        where: { deletedAt: null },
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatarColor: true, image: true } } } },
          labels: { include: { label: true } },
        },
        orderBy: { rank: "asc" },
      },
    },
  });
  if (!sprint) throw new ServiceError("NOT_FOUND", "Sprint not found.");
  const ctx = await requireWorkspaceMembership(actor, sprint.project.workspaceId);
  return { sprint, ctx };
}

export async function createSprint(actor: Actor, raw: z.infer<typeof createSprintSchema>) {
  const input = createSprintSchema.parse(raw);
  const { project, ctx } = await requireProjectAccess(actor, input.projectId, "sprint:manage");

  if (input.startDate.getTime() >= input.endDate.getTime()) {
    throw new ServiceError("VALIDATION", "Sprint start date must be before the end date.");
  }

  return prisma.$transaction(async (tx) => {
    const sprint = await tx.sprint.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        name: input.name,
        goal: input.goal ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      actorId: actor.userId,
      type: "sprint.created",
      metadata: { sprintId: sprint.id, name: sprint.name },
    });
    return sprint;
  });
}

export async function updateSprint(actor: Actor, sprintId: string, raw: z.infer<typeof updateSprintSchema>) {
  const input = updateSprintSchema.parse(raw);
  const { sprint, ctx } = await getSprint(actor, sprintId);
  await requirePermission(ctx, "sprint:manage");
  if (sprint.status === "COMPLETED") {
    throw new ServiceError("CONFLICT", "Completed sprints cannot be edited.");
  }
  const startDate = input.startDate ?? sprint.startDate;
  const endDate = input.endDate ?? sprint.endDate;
  if (startDate.getTime() >= endDate.getTime()) {
    throw new ServiceError("VALIDATION", "Sprint start date must be before the end date.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id: sprint.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.goal !== undefined ? { goal: input.goal } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: sprint.projectId,
      actorId: actor.userId,
      type: "sprint.updated",
      metadata: { sprintId: sprint.id, fields: Object.keys(input) },
    });
    return updated;
  });
}

export async function startSprint(actor: Actor, sprintId: string) {
  const { sprint, ctx } = await getSprint(actor, sprintId);
  await requirePermission(ctx, "sprint:manage");

  if (sprint.status !== "PLANNED") {
    throw new ServiceError("CONFLICT", "Only planned sprints can be started.");
  }
  const active = await prisma.sprint.findFirst({
    where: { projectId: sprint.projectId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (active) {
    throw new ServiceError(
      "CONFLICT",
      `Sprint "${active.name}" is already active in this project. Complete it first.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id: sprint.id },
      data: { status: "ACTIVE" },
    });
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: sprint.projectId,
      actorId: actor.userId,
      type: "sprint.started",
      metadata: {
        sprintId: sprint.id,
        name: sprint.name,
        issueCount: sprint.issues.length,
      },
    });
    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId: sprint.projectId },
      { type: "sprint.updated", payload: { sprintId: sprint.id, projectId: sprint.projectId, status: "ACTIVE" } },
    );
    return updated;
  });
}

export async function completeSprint(actor: Actor, raw: z.infer<typeof completeSprintSchema>) {
  const input = completeSprintSchema.parse(raw);
  const { sprint, ctx } = await getSprint(actor, input.sprintId);
  await requirePermission(ctx, "sprint:manage");

  if (sprint.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "Only active sprints can be completed.");
  }

  const doneKeys = new Set<string>();
  const donePoints = sprint.issues
    .filter((i) => i.statusCategory === "DONE")
    .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const unfinished = sprint.issues.filter((i) => i.statusCategory !== "DONE");

  if (input.moveUnfinishedTo === "next-sprint") {
    if (!input.nextSprintId) {
      throw new ServiceError("VALIDATION", "Select the sprint to move unfinished issues to.");
    }
    const next = await prisma.sprint.findFirst({
      where: { id: input.nextSprintId, projectId: sprint.projectId, status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (!next) throw new ServiceError("VALIDATION", "Target sprint not found.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id: sprint.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    for (const issue of unfinished) {
      if (input.moveUnfinishedTo === "backlog") {
        await tx.issue.update({
          where: { id: issue.id },
          data: { sprintId: null, status: "backlog", statusCategory: "BACKLOG" },
        });
      } else if (input.moveUnfinishedTo === "next-sprint" && input.nextSprintId) {
        await tx.issue.update({ where: { id: issue.id }, data: { sprintId: input.nextSprintId } });
        await tx.sprintIssue.upsert({
          where: { sprintId_issueId: { sprintId: input.nextSprintId, issueId: issue.id } },
          create: { sprintId: input.nextSprintId, issueId: issue.id, addedById: actor.userId },
          update: { removedAt: null },
        });
      } else {
        await tx.issue.update({ where: { id: issue.id }, data: { sprintId: null } });
      }
    }

    for (const issue of sprint.issues) {
      if (issue.statusCategory === "DONE") doneKeys.add(issue.key);
    }

    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: sprint.projectId,
      actorId: actor.userId,
      type: "sprint.completed",
      metadata: {
        sprintId: sprint.id,
        name: sprint.name,
        totalIssues: sprint.issues.length,
        completedIssues: doneKeys.size,
        carriedOver: unfinished.length,
        completedPoints: donePoints,
        totalPoints: sprint.issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0),
        completedIssueKeys: [...doneKeys],
        moveUnfinishedTo: input.moveUnfinishedTo,
      },
    });

    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId: sprint.projectId },
      { type: "sprint.updated", payload: { sprintId: sprint.id, projectId: sprint.projectId, status: "COMPLETED" } },
    );
    return updated;
  });
}

export async function addIssuesToSprint(actor: Actor, raw: z.infer<typeof sprintIssuesSchema>) {
  const input = sprintIssuesSchema.parse(raw);
  const { sprint, ctx } = await getSprint(actor, input.sprintId);
  await requirePermission(ctx, "sprint:content");

  if (sprint.status === "COMPLETED") {
    throw new ServiceError("CONFLICT", "Completed sprints cannot be modified.");
  }

  const issues = await prisma.issue.findMany({
    where: { id: { in: input.issueIds }, projectId: sprint.projectId, deletedAt: null },
    select: { id: true, key: true },
  });
  if (issues.length !== input.issueIds.length) {
    throw new ServiceError("VALIDATION", "Some issues do not belong to this project.");
  }

  await prisma.$transaction(async (tx) => {
    for (const issue of issues) {
      if (input.action === "add") {
        await tx.issue.update({ where: { id: issue.id }, data: { sprintId: sprint.id } });
        await tx.sprintIssue.upsert({
          where: { sprintId_issueId: { sprintId: sprint.id, issueId: issue.id } },
          create: { sprintId: sprint.id, issueId: issue.id, addedById: actor.userId },
          update: { removedAt: null, addedById: actor.userId },
        });
      } else {
        await tx.issue.update({ where: { id: issue.id }, data: { sprintId: null } });
        await tx.sprintIssue.updateMany({
          where: { sprintId: sprint.id, issueId: issue.id, removedAt: null },
          data: { removedAt: new Date() },
        });
      }
    }
    await recordActivity(tx, {
      workspaceId: ctx.workspaceId,
      projectId: sprint.projectId,
      actorId: actor.userId,
      type: "sprint.issues_changed",
      metadata: {
        sprintId: sprint.id,
        action: input.action,
        issueKeys: issues.map((i) => i.key),
      },
    });
    realtimeBus.publish(
      { workspaceId: ctx.workspaceId, projectId: sprint.projectId },
      { type: "sprint.updated", payload: { sprintId: sprint.id, projectId: sprint.projectId, status: sprint.status } },
    );
  });

  return { updated: issues.length };
}

// ── Reports ─────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  date: string; // ISO date
  remaining: number;
  ideal: number;
}

export interface SprintReport {
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    status: string;
    startDate: string;
    endDate: string;
    completedAt: string | null;
  };
  totals: {
    scopeIssues: number;
    completedIssues: number;
    carriedOver: number;
    scopePoints: number;
    completedPoints: number;
    completionPct: number;
  };
  burndown: BurndownPoint[];
  scopeChanges: Array<{ date: string; delta: number; issueKey: string }>;
}

export async function sprintReport(actor: Actor, sprintId: string): Promise<SprintReport> {
  const { sprint, ctx } = await getSprint(actor, sprintId);
  void ctx;

  // Full issue set that was ever part of the sprint (current + historical rows)
  const history = await prisma.sprintIssue.findMany({
    where: { sprintId: sprint.id },
    include: {
      issue: {
        select: {
          id: true,
          key: true,
          statusCategory: true,
          storyPoints: true,
          createdAt: true,
          sprintId: true,
        },
      },
    },
  });
  const issueIds = [...new Set(history.map((h) => h.issue.id))];
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, key: true, statusCategory: true, storyPoints: true, createdAt: true, sprintId: true },
  });

  // Replay status-change + creation events for the sprint's issues
  const activities = await prisma.activity.findMany({
    where: {
      issueId: { in: issueIds },
      type: { in: ["issue.status_changed", "issue.created", "issue.moved"] },
    },
    orderBy: { createdAt: "asc" },
    select: { type: true, issueId: true, createdAt: true, metadata: true },
  });

  const start = sprint.startDate.getTime();
  const end = (sprint.completedAt ?? sprint.endDate).getTime();
  const totalDays = Math.max(1, Math.ceil((end - start) / DAY_MS));

  // Map issue -> doneAt (first time it reached DONE category after sprint start)
  const doneAt = new Map<string, number>();
  for (const a of activities) {
    if (!a.issueId) continue;
    const meta = a.metadata as { to?: string };
    if (a.type === "issue.status_changed" || a.type === "issue.moved") {
      // Approximate: any status change with metadata.to whose category is done
      // (activities store the destination column key in metadata.to).
      const to = meta?.to;
      if (to && ["done", "closed", "complete", "completed", "shipped"].includes(to.toLowerCase())) {
        if (!doneAt.has(a.issueId)) doneAt.set(a.issueId, a.createdAt.getTime());
      }
    }
  }
  // Fallback for issues currently DONE with no matching event: treat end of sprint
  for (const i of issues) {
    if (i.statusCategory === "DONE" && !doneAt.has(i.id)) {
      doneAt.set(i.id, end);
    }
  }

  const scopeChanges: SprintReport["scopeChanges"] = [];
  for (const h of history) {
    scopeChanges.push({
      date: h.addedAt.toISOString(),
      delta: 1,
      issueKey: h.issue.key,
    });
    if (h.removedAt) {
      scopeChanges.push({
        date: h.removedAt.toISOString(),
        delta: -1,
        issueKey: h.issue.key,
      });
    }
  }
  scopeChanges.sort((a, b) => a.date.localeCompare(b.date));

  // Build burndown: remaining = scoped issues not yet done at end of each day
  const burndown: BurndownPoint[] = [];
  const initialScope = issues.length;
  for (let day = 0; day <= totalDays; day++) {
    const t = start + day * DAY_MS;
    let remaining = 0;
    for (const i of issues) {
      const added = history.find((h) => h.issue.id === i.id)?.addedAt.getTime() ?? start;
      const removed = history.find((h) => h.issue.id === i.id && h.removedAt)?.removedAt?.getTime();
      if (t < added) continue;
      if (removed && t >= removed) continue;
      const d = doneAt.get(i.id);
      if (d && t >= d) continue;
      remaining++;
    }
    const ideal = Math.max(0, Math.round(initialScope * (1 - day / totalDays)));
    burndown.push({
      date: new Date(t).toISOString().slice(0, 10),
      remaining,
      ideal,
    });
  }

  const completed = issues.filter((i) => i.statusCategory === "DONE");
  const completedPoints = completed.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const scopePoints = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate.toISOString(),
      endDate: sprint.endDate.toISOString(),
      completedAt: sprint.completedAt?.toISOString() ?? null,
    },
    totals: {
      scopeIssues: issues.length,
      completedIssues: completed.length,
      carriedOver: issues.filter((i) => i.sprintId !== sprint.id || i.statusCategory !== "DONE").length,
      scopePoints,
      completedPoints,
      completionPct: issues.length === 0 ? 0 : Math.round((completed.length / issues.length) * 100),
    },
    burndown,
    scopeChanges,
  };
}

/** Velocity history: completed story points per completed sprint + rolling average. */
export async function velocityReport(actor: Actor, workspaceIdOrSlug: string, projectKey?: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const sprints = await prisma.sprint.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: "COMPLETED",
      ...(projectKey ? { project: { key: projectKey.toUpperCase() } } : {}),
    },
    orderBy: { completedAt: "asc" },
    select: {
      id: true,
      name: true,
      completedAt: true,
      startDate: true,
      endDate: true,
      project: { select: { key: true } },
    },
    take: 50,
  });

  const points: Array<{ sprintId: string; name: string; projectKey: string; completedPoints: number; completedIssues: number; date: string }> = [];
  for (const s of sprints) {
    // Completed points = issues that are in this sprint and currently DONE
    const done = await prisma.issue.findMany({
      where: { sprintId: s.id, statusCategory: "DONE", deletedAt: null },
      select: { storyPoints: true },
      take: 500,
    });
    points.push({
      sprintId: s.id,
      name: s.name,
      projectKey: s.project.key,
      completedPoints: done.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
      completedIssues: done.length,
      date: (s.completedAt ?? s.endDate).toISOString(),
    });
  }

  const recent = points.slice(-6);
  const avg = recent.length
    ? Math.round((recent.reduce((s, p) => s + p.completedPoints, 0) / recent.length) * 10) / 10
    : 0;

  return { sprints: points, averageVelocity: avg };
}

export type SprintReportData = Prisma.SprintGetPayload<Record<string, never>>;
