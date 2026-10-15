/**
 * Development seed. Creates a demo user, workspace, project, board columns,
 * sprint, and issues so the app is explorable right after `npm run db:seed`.
 *
 * This is DEVELOPMENT DATA only — never used in production. Credentials:
 *   demo@taskflow.dev / demo1234
 */
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {
  /* optional */
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "demo@taskflow.dev";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed data already present (demo user exists). Skipping.");
    return;
  }

  const passwordHash = await hashPassword("demo1234");
  const user = await prisma.user.create({
    data: {
      name: "Demo User",
      email,
      passwordHash,
      emailVerified: new Date(),
      avatarColor: "#6366F1",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Acme Engineering",
      slug: "acme-engineering",
      description: "Demo workspace for exploring TaskFlow",
      icon: "🚀",
      color: "#6366F1",
      createdById: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      key: "NOVA",
      name: "Nova Platform",
      description: "The next-generation platform rebuild",
      icon: "⚡",
      color: "#8B5CF6",
      status: "ACTIVE",
      createdById: user.id,
      members: { create: { userId: user.id, role: "PROJECT_MANAGER" } },
      boardColumns: {
        create: [
          { workspaceId: workspace.id, key: "backlog", name: "Backlog", category: "BACKLOG", position: 0 },
          { workspaceId: workspace.id, key: "todo", name: "To Do", category: "TODO", position: 1 },
          { workspaceId: workspace.id, key: "in_progress", name: "In Progress", category: "IN_PROGRESS", position: 2 },
          { workspaceId: workspace.id, key: "in_review", name: "In Review", category: "IN_REVIEW", position: 3 },
          { workspaceId: workspace.id, key: "done", name: "Done", category: "DONE", position: 4 },
        ],
      },
    },
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const sprint = await prisma.sprint.create({
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      name: "Sprint 1",
      goal: "Ship the authentication foundation",
      startDate: new Date(now - 3 * day),
      endDate: new Date(now + 11 * day),
      status: "ACTIVE",
    },
  });

  const samples = [
    { n: 1, title: "Design the workspace onboarding flow", type: "STORY" as const, status: "done", category: "DONE" as const, points: 5, priority: "HIGH" as const, due: -2 },
    { n: 2, title: "Implement role-based access control", type: "TASK" as const, status: "done", category: "DONE" as const, points: 8, priority: "URGENT" as const, due: -1 },
    { n: 3, title: "Set up email verification pipeline", type: "TASK" as const, status: "in_progress", category: "IN_PROGRESS" as const, points: 3, priority: "HIGH" as const, due: 2 },
    { n: 4, title: "Board drag-and-drop keyboard support", type: "TASK" as const, status: "in_progress", category: "IN_PROGRESS" as const, points: 5, priority: "MEDIUM" as const, due: 4 },
    { n: 5, title: "Login button does nothing on Safari", type: "BUG" as const, status: "in_review", category: "IN_REVIEW" as const, points: 2, priority: "URGENT" as const, due: 1 },
    { n: 6, title: "Sprint burndown chart component", type: "TASK" as const, status: "todo", category: "TODO" as const, points: 3, priority: "MEDIUM" as const, due: 6 },
    { n: 7, title: "Notification preferences UI", type: "TASK" as const, status: "todo", category: "TODO" as const, points: 2, priority: "LOW" as const, due: 8 },
    { n: 8, title: "GitHub webhook signature verification", type: "STORY" as const, status: "backlog", category: "BACKLOG" as const, points: 5, priority: "HIGH" as const, due: null },
    { n: 9, title: "AI task generation confirmation flow", type: "STORY" as const, status: "backlog", category: "BACKLOG" as const, points: 8, priority: "MEDIUM" as const, due: null },
    { n: 10, title: "Fix flaky e2e board test", type: "BUG" as const, status: "backlog", category: "BACKLOG" as const, points: 1, priority: "LOW" as const, due: 12 },
  ];

  let seq = 0;
  for (const s of samples) {
    seq += 1;
    await prisma.issue.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        number: seq,
        key: `NOVA-${seq}`,
        title: s.title,
        description: `## Context\nSeeded development issue for ${s.title}.\n\n- Acceptance criteria TBD`,
        type: s.type,
        status: s.status,
        statusCategory: s.category,
        priority: s.priority,
        storyPoints: s.points,
        dueDate: s.due === null ? null : new Date(now + s.due * day),
        sprintId: s.category === "BACKLOG" ? null : sprint.id,
        reporterId: user.id,
        createdById: user.id,
        rank: seq * 1024,
        assignees: { create: { userId: user.id, assignedById: user.id } },
      },
    });
    if (s.category !== "BACKLOG") {
      await prisma.sprintIssue.create({
        data: { sprintId: sprint.id, issueId: (await prisma.issue.findUniqueOrThrow({ where: { projectId_key: { projectId: project.id, key: `NOVA-${seq}` } } })).id, addedById: user.id },
      });
    }
    await prisma.project.update({
      where: { id: project.id },
      data: { issueSequence: seq },
    });
  }

  await prisma.activity.create({
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      actorId: user.id,
      type: "project.created",
      metadata: { seeded: true },
    },
  });

  console.log("Seeded: demo@taskflow.dev / demo1234 — workspace 'Acme Engineering' (NOVA).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
