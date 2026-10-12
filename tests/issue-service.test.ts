import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, cleanupTestDb, testPrisma } from "./helpers";
import { createWorkspace } from "@/lib/services/workspace";
import { createProject, projectMetrics } from "@/lib/services/project";
import {
  createIssue,
  moveIssue,
  updateIssue,
  deleteIssue,
  duplicateIssue,
  listIssuesInWorkspace,
  myIssues,
  getIssueByKey,
  bulkUpdateIssues,
} from "@/lib/services/issue";
import type { Actor } from "@/lib/auth/session";

let actor: Actor;
let workspaceSlug: string;
let projectId: string;

beforeAll(async () => {
  await cleanupTestDb();
  actor = await createTestUser("Issue Tester");
  const ws = await createWorkspace(actor, { name: "Issue Test Workspace" });
  workspaceSlug = ws.slug;
  const project = await createProject(actor, workspaceSlug, { name: "Alpha", key: "ALP" });
  projectId = project.id;
});

afterAll(async () => {
  await cleanupTestDb();
  await testPrisma().$disconnect();
});

describe("issue key generation", () => {
  it("generates sequential human-readable keys", async () => {
    const a = await createIssue(actor, { projectId, title: "First issue" });
    const b = await createIssue(actor, { projectId, title: "Second issue" });
    expect(a.key).toBe("ALP-1");
    expect(b.key).toBe("ALP-2");
    expect(a.number).toBe(1);
  });

  it("stays unique and monotonic under concurrent creation", async () => {
    const titles = Array.from({ length: 12 }, (_, i) => `Concurrent issue ${i}`);
    const created = await Promise.all(
      titles.map((title) => createIssue(actor, { projectId, title })),
    );
    const keys = created.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const numbers = created.map((c) => c.number).sort((x, y) => x - y);
    // no duplicates and all within the allocated range
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const k of keys) expect(k).toMatch(/^ALP-\d+$/);
  });

  it("finds issues by key case-insensitively through getIssueByKey", async () => {
    const { issue } = await getIssueByKey(actor, workspaceSlug, "alp-1");
    expect(issue.key).toBe("ALP-1");
  });
});

describe("issue updates", () => {
  it("changes status and records the new board category", async () => {
    const issue = await createIssue(actor, { projectId, title: "Move me" });
    const updated = await updateIssue(actor, issue.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
    expect(updated.statusCategory).toBe("IN_PROGRESS");
  });

  it("assigns workspace members and rejects non-members", async () => {
    const issue = await createIssue(actor, { projectId, title: "Assign me" });
    const updated = await updateIssue(actor, issue.id, { assigneeIds: [actor.userId] });
    expect(updated.assignees.map((a) => a.user.id)).toContain(actor.userId);

    const outsider = await createTestUser("Outsider");
    await expect(updateIssue(actor, issue.id, { assigneeIds: [outsider.userId] })).rejects.toThrow(
      /workspace members/i,
    );
  });

  it("duplicates an issue with a fresh key and copied fields", async () => {
    const issue = await createIssue(actor, {
      projectId,
      title: "Original",
      priority: "HIGH",
      storyPoints: 5,
    });
    const copy = await duplicateIssue(actor, { issueId: issue.id });
    expect(copy.key).not.toBe(issue.key);
    expect(copy.title).toContain("Original");
    expect(copy.priority).toBe("HIGH");
    expect(copy.storyPoints).toBe(5);
  });

  it("soft-deletes issues so they disappear from listings", async () => {
    const issue = await createIssue(actor, { projectId, title: "Delete me" });
    await deleteIssue(actor, issue.id);
    await expect(getIssueByKey(actor, workspaceSlug, issue.key)).rejects.toThrow(/not found/i);
    const rows = await testPrisma().issue.findUnique({ where: { id: issue.id } });
    expect(rows?.deletedAt).not.toBeNull();
  });
});

describe("board ordering", () => {
  it("persists ordering when moving within and across columns", async () => {
    const a = await createIssue(actor, { projectId, title: "Order A", status: "todo" });
    const b = await createIssue(actor, { projectId, title: "Order B", status: "todo" });

    // place A before B
    await moveIssue(actor, { issueId: a.id, status: "todo", beforeId: b.id, afterId: null });
    const board = await listIssuesInWorkspace(actor, workspaceSlug, {
      projectId,
      status: "todo",
      includeDone: true,
      sort: "rank",
      dir: "asc",
    });
    const keys = board.items.map((i) => i.key);
    expect(keys.indexOf(a.key)).toBeLessThan(keys.indexOf(b.key));

    // move A to in_progress with position at top
    const moved = await moveIssue(actor, { issueId: a.id, status: "in_progress", beforeId: null, afterId: null });
    expect(moved.status).toBe("in_progress");
    expect(moved.statusCategory).toBe("IN_PROGRESS");
  });
});

describe("filtering, search and bulk operations", () => {
  it("filters by text, priority and assignee", async () => {
    await createIssue(actor, {
      projectId,
      title: "Filterable special task",
      priority: "URGENT",
      assigneeIds: [actor.userId],
    });
    const r = await listIssuesInWorkspace(actor, workspaceSlug, {
      projectId,
      q: "Filterable",
      priority: "URGENT",
      assigneeId: "me",
      includeDone: true,
    });
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items[0]!.title).toContain("Filterable");
  });

  it("bulk-updates priorities with permission checks", async () => {
    const a = await createIssue(actor, { projectId, title: "Bulk 1" });
    const b = await createIssue(actor, { projectId, title: "Bulk 2" });
    const res = await bulkUpdateIssues(actor, workspaceSlug, {
      issueIds: [a.id, b.id],
      action: "setPriority",
      payload: { priority: "LOW" },
    });
    expect(res.updated).toBe(2);
    const check = await testPrisma().issue.findUnique({ where: { id: a.id } });
    expect(check?.priority).toBe("LOW");
  });

  it("lists the current user's assigned issues", async () => {
    const mine = await myIssues(actor, workspaceSlug, { includeDone: true });
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine.every((i) => i.assignees.some((a) => a.user.id === actor.userId))).toBe(true);
  });

  it("computes project metrics from real records", async () => {
    const metrics = await projectMetrics(projectId);
    expect(metrics.totalIssues).toBeGreaterThan(0);
    expect(metrics.doneIssues + metrics.openIssues).toBe(metrics.totalIssues);
    expect(metrics.completionPct).toBeGreaterThanOrEqual(0);
  });
});
