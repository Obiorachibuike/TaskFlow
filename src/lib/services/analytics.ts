/**
 * Workspace dashboard + reporting aggregates. Every number is computed from
 * persisted database records — no demo data. Calculation notes live in
 * docs/METRICS.md.
 */
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/session";
import { requireWorkspaceMembership, requirePermission } from "@/lib/auth/guards";

export async function workspaceDashboard(actor: Actor, workspaceIdOrSlug: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "analytics:view");
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const whereWorkspace = { workspaceId: ctx.workspaceId, deletedAt: null } as const;

  const [
    totalProjects,
    openIssues,
    completedIssues,
    overdueIssues,
    myAssigned,
    upcomingDeadlines,
    recentActivity,
    statusBreakdown,
    priorityBreakdown,
  ] = await Promise.all([
    prisma.project.count({ where: { workspaceId: ctx.workspaceId, deletedAt: null } }),
    prisma.issue.count({ where: { ...whereWorkspace, statusCategory: { not: "DONE" } } }),
    prisma.issue.count({ where: { ...whereWorkspace, statusCategory: "DONE" } }),
    prisma.issue.count({
      where: { ...whereWorkspace, statusCategory: { not: "DONE" }, dueDate: { lt: now } },
    }),
    prisma.issue.count({
      where: {
        ...whereWorkspace,
        statusCategory: { not: "DONE" },
        assignees: { some: { userId: actor.userId } },
      },
    }),
    prisma.issue.findMany({
      where: {
        ...whereWorkspace,
        statusCategory: { not: "DONE" },
        dueDate: { gte: now, lte: in7Days },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: {
        id: true,
        key: true,
        title: true,
        dueDate: true,
        priority: true,
        project: { select: { key: true, name: true, color: true, icon: true, workspace: { select: { slug: true } } } },
      },
    }),
    prisma.activity.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        actor: { select: { id: true, name: true, image: true, avatarColor: true } },
        issue: { select: { key: true, title: true } },
      },
    }),
    prisma.issue.groupBy({
      by: ["statusCategory"],
      where: whereWorkspace,
      _count: { _all: true },
    }),
    prisma.issue.groupBy({
      by: ["priority"],
      where: { ...whereWorkspace, statusCategory: { not: "DONE" } },
      _count: { _all: true },
    }),
  ]);

  // Project progress (per project completion %)
  const projects = await prisma.project.findMany({
    where: { workspaceId: ctx.workspaceId, deletedAt: null },
    select: {
      id: true,
      key: true,
      name: true,
      color: true,
      icon: true,
      status: true,
      targetDate: true,
    },
  });
  const projectProgress = await Promise.all(
    projects.map(async (p) => {
      const [total, done] = await Promise.all([
        prisma.issue.count({ where: { projectId: p.id, deletedAt: null } }),
        prisma.issue.count({ where: { projectId: p.id, deletedAt: null, statusCategory: "DONE" } }),
      ]);
      return {
        ...p,
        totalIssues: total,
        doneIssues: done,
        completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
      };
    }),
  );

  // Team workload: open issues per member
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { user: { select: { id: true, name: true, image: true, avatarColor: true } } },
  });
  const workload = await Promise.all(
    members.map(async (m) => {
      const open = await prisma.issue.count({
        where: {
          workspaceId: ctx.workspaceId,
          deletedAt: null,
          statusCategory: { not: "DONE" },
          assignees: { some: { userId: m.userId } },
        },
      });
      const done30 = await prisma.issue.count({
        where: {
          workspaceId: ctx.workspaceId,
          deletedAt: null,
          statusCategory: "DONE",
          updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
          assignees: { some: { userId: m.userId } },
        },
      });
      return { user: m.user, role: m.role, openIssues: open, doneLast30Days: done30 };
    }),
  );

  // Active sprint completion
  const activeSprints = await prisma.sprint.findMany({
    where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
    include: {
      project: { select: { key: true, name: true } },
      issues: { where: { deletedAt: null }, select: { statusCategory: true, storyPoints: true } },
    },
    take: 10,
  });
  const sprintCompletion = activeSprints.map((s) => {
    const total = s.issues.length;
    const done = s.issues.filter((i) => i.statusCategory === "DONE").length;
    return {
      sprintId: s.id,
      name: s.name,
      projectKey: s.project.key,
      endDate: s.endDate,
      totalIssues: total,
      doneIssues: done,
      completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });

  return {
    totals: {
      projects: totalProjects,
      openIssues,
      completedIssues,
      overdueIssues,
      myAssigned,
    },
    upcomingDeadlines,
    recentActivity,
    statusBreakdown: Object.fromEntries(
      statusBreakdown.map((r) => [r.statusCategory, r._count._all]),
    ),
    priorityBreakdown: Object.fromEntries(
      priorityBreakdown.map((r) => [r.priority, r._count._all]),
    ),
    projectProgress,
    workload,
    sprintCompletion,
  };
}

export async function issueStatusTimeline(actor: Actor, workspaceIdOrSlug: string, projectId?: string) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  await requirePermission(ctx, "analytics:view");

  // Issues with dates for calendar/timeline views
  return prisma.issue.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
      ...(projectId ? { projectId } : {}),
      OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
    },
    select: {
      id: true,
      key: true,
      title: true,
      type: true,
      status: true,
      statusCategory: true,
      priority: true,
      startDate: true,
      dueDate: true,
      parentIssueId: true,
      project: { select: { key: true, name: true, color: true, icon: true, workspace: { select: { slug: true } } } },
      assignees: { include: { user: { select: { id: true, name: true, avatarColor: true, image: true } } } },
      dependencies: {
        include: { blocker: { select: { id: true, key: true, statusCategory: true, title: true } } },
      },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    take: 500,
  });
}

export async function globalSearch(
  actor: Actor,
  workspaceIdOrSlug: string,
  query: string,
  limit = 20,
) {
  const ctx = await requireWorkspaceMembership(actor, workspaceIdOrSlug);
  const q = query.trim();
  if (q.length < 2) return { issues: [], projects: [], comments: [] };

  const [issues, projects, comments] = await Promise.all([
    prisma.issue.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { key: { contains: q.toUpperCase(), mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        statusCategory: true,
        type: true,
        project: { select: { key: true, name: true, workspace: { select: { slug: true } } } },
      },
      take: limit,
    }),
    prisma.project.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { key: { contains: q.toUpperCase(), mode: "insensitive" } },
        ],
      },
      select: { id: true, key: true, name: true, icon: true, color: true },
      take: Math.ceil(limit / 2),
    }),
    prisma.issueComment.findMany({
      where: {
        deletedAt: null,
        body: { contains: q, mode: "insensitive" },
        issue: { workspaceId: ctx.workspaceId, deletedAt: null },
      },
      select: {
        id: true,
        body: true,
        issue: {
          select: {
            key: true,
            title: true,
            project: { select: { key: true, workspace: { select: { slug: true } } } },
          },
        },
        author: { select: { name: true } },
      },
      take: Math.ceil(limit / 2),
    }),
  ]);

  return { issues, projects, comments };
}
