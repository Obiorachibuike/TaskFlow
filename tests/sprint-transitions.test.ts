import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, cleanupTestDb, testPrisma } from "./helpers";
import { createWorkspace } from "@/lib/services/workspace";
import { createProject } from "@/lib/services/project";
import { createIssue, updateIssue, moveIssue } from "@/lib/services/issue";
import {
  createSprint,
  updateSprint,
  startSprint,
  completeSprint,
  listSprints,
  sprintReport,
  velocityReport,
} from "@/lib/services/sprint";
import type { Actor } from "@/lib/auth/session";

let actor: Actor;
let projectId: string;
let wsSlug: string;

beforeAll(async () => {
  await cleanupTestDb();
  actor = await createTestUser("Sprint Tester");
  const ws = await createWorkspace(actor, { name: "Sprint WS" });
  wsSlug = ws.slug;
  const project = await createProject(actor, wsSlug, { name: "Sprint Proj", key: "SPR" });
  projectId = project.id;
});

afterAll(async () => {
  await cleanupTestDb();
  await testPrisma().$disconnect();
});

describe("sprint lifecycle transitions", () => {
  it("creates a planned sprint and lists it", async () => {
    const sprint = await createSprint(actor, {
      projectId,
      name: "Sprint 1",
      goal: "Ship the core",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-14"),
    });
    expect(sprint.status).toBe("PLANNED");
    const list = await listSprints(actor, wsSlug, "SPR");
    expect(list.length).toBe(1);
  });

  it("allows editing a planned sprint", async () => {
    const list = await listSprints(actor, wsSlug, "SPR");
    const updated = await updateSprint(actor, list[0]!.id, { goal: "Updated goal" });
    expect(updated.goal).toBe("Updated goal");
  });

  it("rejects inverted date ranges at the service level", async () => {
    const list = await listSprints(actor, wsSlug, "SPR");
    await expect(
      updateSprint(actor, list[0]!.id, {
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-02-01"),
      }),
    ).rejects.toThrow(/before the end date/i);
  });

  it("starts a sprint and blocks starting a second active sprint", async () => {
    const list = await listSprints(actor, wsSlug, "SPR");
    const started = await startSprint(actor, list[0]!.id);
    expect(started.status).toBe("ACTIVE");

    const second = await createSprint(actor, {
      projectId,
      name: "Sprint 2",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-01-28"),
    });
    await expect(startSprint(actor, second.id)).rejects.toThrow(/already active/i);
  });

  it("only planned sprints can be started", async () => {
    const active = (await listSprints(actor, wsSlug, "SPR")).find((s) => s.status === "ACTIVE")!;
    await expect(startSprint(actor, active.id)).rejects.toThrow(/Only planned/i);
  });

  it("assigns issues to the active sprint", async () => {
    const issue = await createIssue(actor, { projectId, title: "Sprint work item" });
    const list = await listSprints(actor, wsSlug, "SPR");
    const updated = await updateIssue(actor, issue.id, { sprintId: list[0]!.id });
    expect(updated.sprint?.id).toBe(list[0]!.id);
  });

  it("completes a sprint, carries unfinished work, and snapshots stats in activity", async () => {
    const sprints = await listSprints(actor, wsSlug, "SPR");
    const active = sprints.find((s) => s.status === "ACTIVE")!;

    const doneIssue = await createIssue(actor, {
      projectId,
      title: "Finished work",
      storyPoints: 3,
      sprintId: active.id,
    });
    const openIssue = await createIssue(actor, {
      projectId,
      title: "Unfinished work",
      storyPoints: 5,
      sprintId: active.id,
    });
    await moveIssue(actor, { issueId: doneIssue.id, status: "done", beforeId: null, afterId: null });

    const completed = await completeSprint(actor, {
      sprintId: active.id,
      moveUnfinishedTo: "backlog",
    });
    expect(completed.status).toBe("COMPLETED");

    // snapshot persisted as sprint.completed activity
    const activity = await testPrisma().activity.findFirst({
      where: { type: "sprint.completed", projectId },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).not.toBeNull();
    const meta = activity!.metadata as { completedIssueKeys: string[]; completedPoints: number };
    expect(meta.completedIssueKeys).toContain(doneIssue.key);
    expect(meta.completedPoints).toBe(3);

    // unfinished issue moved to backlog
    const open = await testPrisma().issue.findUnique({ where: { id: openIssue.id } });
    expect(open?.sprintId).toBeNull();
    expect(open?.status).not.toBe("done");
  });

  it("completed sprints cannot be edited or re-completed", async () => {
    const sprints = await listSprints(actor, wsSlug, "SPR");
    const completed = sprints.find((s) => s.status === "COMPLETED")!;
    await expect(updateSprint(actor, completed.id, { name: "Nope" })).rejects.toThrow(/cannot be edited/i);
    await expect(
      completeSprint(actor, { sprintId: completed.id, moveUnfinishedTo: "none" }),
    ).rejects.toThrow(/Only active/i);
    await expect(startSprint(actor, completed.id)).rejects.toThrow(/Only planned/i);
  });

  it("rejects completing a sprint that was never started", async () => {
    const draft = await createSprint(actor, {
      projectId,
      name: "Never started",
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-02-14"),
    });
    await expect(
      completeSprint(actor, { sprintId: draft.id, moveUnfinishedTo: "backlog" }),
    ).rejects.toThrow(/Only active/i);
  });
});

describe("reports computed from persisted data", () => {
  it("computes burndown from issue + activity records", async () => {
    const sprints = await listSprints(actor, wsSlug, "SPR");
    const completed = sprints.find((s) => s.status === "COMPLETED")!;
    const report = await sprintReport(actor, completed.id);
    expect(report.burndown.length).toBeGreaterThan(0);
    for (const pt of report.burndown) {
      expect(pt.remaining).toBeGreaterThanOrEqual(0);
      expect(pt.ideal).toBeGreaterThanOrEqual(0);
    }
    expect(report.totals.completedPoints).toBe(3);
    expect(report.totals.scopePoints).toBeGreaterThanOrEqual(8);
  });

  it("computes velocity from completed sprints", async () => {
    const velocity = await velocityReport(actor, wsSlug, "SPR");
    expect(velocity.sprints.length).toBeGreaterThanOrEqual(1);
    expect(velocity.averageVelocity).toBeGreaterThanOrEqual(0);
  });
});
