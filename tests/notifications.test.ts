import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, cleanupTestDb, testPrisma } from "./helpers";
import { createWorkspace } from "@/lib/services/workspace";
import { createProject } from "@/lib/services/project";
import { createIssue } from "@/lib/services/issue";
import {
  notify,
  listNotifications,
  unreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPrefs,
  getNotificationPrefs,
  runDueDateReminders,
} from "@/lib/services/notifications";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/session";

let owner: Actor;
let dev: Actor;
let wsId: string;
let wsSlug: string;

beforeAll(async () => {
  await cleanupTestDb();
  owner = await createTestUser("Notify Owner");
  dev = await createTestUser("Notify Dev");
  const ws = await createWorkspace(owner, { name: "Notify WS" });
  wsId = ws.id;
  wsSlug = ws.slug;
  await testPrisma().workspaceMember.create({
    data: { workspaceId: wsId, userId: dev.userId, role: "DEVELOPER" },
  });
});

afterAll(async () => {
  await cleanupTestDb();
  await testPrisma().$disconnect();
});

describe("notification creation", () => {
  it("creates durable DB notifications for recipients", async () => {
    await notify(prisma, {
      workspaceId: wsId,
      userId: dev.userId,
      actorId: owner.userId,
      type: "mention",
      title: "You were mentioned",
      body: "in Issue NOVA-1",
    });
    const inbox = await listNotifications(dev.userId, wsId);
    expect(inbox.length).toBe(1);
    expect(inbox[0]!.type).toBe("mention");
    expect(inbox[0]!.readAt).toBeNull();
  });

  it("never notifies users about their own actions", async () => {
    await notify(prisma, {
      workspaceId: wsId,
      userId: owner.userId,
      actorId: owner.userId,
      type: "assignment",
      title: "Self assignment",
    });
    const ownerInbox = await listNotifications(owner.userId, wsId);
    expect(ownerInbox.length).toBe(0);
  });

  it("respects in-app notification preferences", async () => {
    const prefs = await getNotificationPrefs(dev.userId);
    await updateNotificationPrefs(dev.userId, { ...prefs, inAppMentions: false });

    await notify(prisma, {
      workspaceId: wsId,
      userId: dev.userId,
      actorId: owner.userId,
      type: "mention",
      title: "Muted mention",
    });
    const afterMute = await listNotifications(dev.userId, wsId);
    expect(afterMute.find((n) => n.title === "Muted mention")).toBeUndefined();

    await updateNotificationPrefs(dev.userId, { ...prefs, inAppMentions: true });
    await notify(prisma, {
      workspaceId: wsId,
      userId: dev.userId,
      actorId: owner.userId,
      type: "mention",
      title: "Unmuted mention",
    });
    const afterUnmute = await listNotifications(dev.userId, wsId);
    expect(afterUnmute.find((n) => n.title === "Unmuted mention")).toBeDefined();
  });
});

describe("notification lifecycle", () => {
  it("marks notifications read and unread counts drop", async () => {
    const before = await unreadCount(dev.userId, wsId);
    expect(before).toBeGreaterThan(0);
    const inbox = await listNotifications(dev.userId, wsId, { unreadOnly: true });
    await markNotificationRead(dev.userId, inbox[0]!.id);
    const after = await unreadCount(dev.userId, wsId);
    expect(after).toBe(before - 1);
  });

  it("mark-all-read only affects the current user", async () => {
    await notify(prisma, {
      workspaceId: wsId,
      userId: owner.userId,
      actorId: dev.userId,
      type: "assignment",
      title: "For owner",
    });
    await markAllNotificationsRead(dev.userId, wsId);
    expect(await unreadCount(dev.userId, wsId)).toBe(0);
    expect(await unreadCount(owner.userId, wsId)).toBeGreaterThan(0);
  });

  it("notifications cannot be marked read across users", async () => {
    const ownerInbox = await listNotifications(owner.userId, wsId);
    const result = await markNotificationRead(dev.userId, ownerInbox[0]!.id);
    expect(result).toBeNull();
  });
});

describe("due-date reminders", () => {
  it("notifies assignees of issues due within 24h and skips empty runs", async () => {
    const project = await createProject(owner, wsSlug, { name: "NProj", key: "NPR" });
    await createIssue(owner, {
      projectId: project.id,
      title: "Due soon task",
      assigneeIds: [dev.userId],
      dueDate: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await runDueDateReminders();
    expect(result.notified).toBeGreaterThanOrEqual(1);
    const inbox = await listNotifications(dev.userId, wsId);
    expect(
      inbox.some((n) => n.type === "due_date" && (n.body ?? "").includes("Due soon task")),
    ).toBe(true);

    // second run should not duplicate within the same window
    const again = await runDueDateReminders();
    expect(again.notified).toBe(0);
  });
});
