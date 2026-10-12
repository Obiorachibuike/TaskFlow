import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { realtimeBus } from "@/lib/realtime/bus";
import { sendDueDateReminderEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export type NotificationType =
  | "mention"
  | "assignment"
  | "invitation"
  | "due_date"
  | "status_change"
  | "comment"
  | "system";

type Tx = Prisma.TransactionClient | typeof prisma;

export interface NotifyInput {
  userId: string; // recipient
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  actorId?: string;
  issueId?: string;
}

function preferenceAllows(
  prefs: {
    emailInvites: boolean;
    emailAssignments: boolean;
    emailMentions: boolean;
    emailDueDate: boolean;
    emailStatusChange: boolean;
    inAppMentions: boolean;
    inAppAssignments: boolean;
    inAppStatusChange: boolean;
  } | null,
  type: NotificationType,
  channel: "inApp" | "email",
): boolean {
  const p = prefs ?? {
    emailInvites: true,
    emailAssignments: true,
    emailMentions: true,
    emailDueDate: true,
    emailStatusChange: false,
    inAppMentions: true,
    inAppAssignments: true,
    inAppStatusChange: true,
  };
  switch (type) {
    case "invitation":
      return channel === "email" ? p.emailInvites : true;
    case "assignment":
      return channel === "email" ? p.emailAssignments : p.inAppAssignments;
    case "mention":
      return channel === "email" ? p.emailMentions : p.inAppMentions;
    case "due_date":
      return channel === "email" ? p.emailDueDate : true;
    case "status_change":
      return channel === "email" ? p.emailStatusChange : p.inAppStatusChange;
    default:
      return true;
  }
}

/** Create an in-app notification + realtime push (email handled separately by flows). */
export async function notify(tx: Tx, input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return; // never notify yourself

  const prefs = await tx.notificationPreference.findUnique({
    where: { userId: input.userId },
  });
  if (!preferenceAllows(prefs, input.type, "inApp")) return;

  const created = await tx.notification.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      actorId: input.actorId ?? null,
      issueId: input.issueId ?? null,
    },
  });

  realtimeBus.publish(
    { workspaceId: input.workspaceId, userId: input.userId },
    { type: "notification.created", payload: { notificationId: created.id, userId: input.userId } },
  );
}

export async function notifyMany(tx: Tx, inputs: NotifyInput[]): Promise<void> {
  for (const input of inputs) {
    await notify(tx, input);
  }
}

/** Should an email also be sent for this notification type, per preferences? */
export async function shouldEmail(userId: string, type: NotificationType): Promise<boolean> {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  return preferenceAllows(prefs, type, "email");
}

export async function listNotifications(
  userId: string,
  workspaceId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  return prisma.notification.findMany({
    where: {
      userId,
      workspaceId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 30, 100),
    include: {
      actor: { select: { id: true, name: true, image: true, avatarColor: true } },
      issue: { select: { key: true, title: true } },
    },
  });
}

export async function unreadCount(userId: string, workspaceId: string) {
  return prisma.notification.count({ where: { userId, workspaceId, readAt: null } });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const n = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!n) return null;
  return prisma.notification.update({
    where: { id: n.id },
    data: { readAt: n.readAt ?? new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, workspaceId: string) {
  const res = await prisma.notification.updateMany({
    where: { userId, workspaceId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

export async function getNotificationPrefs(userId: string) {
  return (
    (await prisma.notificationPreference.findUnique({ where: { userId } })) ?? {
      emailInvites: true,
      emailAssignments: true,
      emailMentions: true,
      emailDueDate: true,
      emailStatusChange: false,
      inAppMentions: true,
      inAppAssignments: true,
      inAppStatusChange: true,
    }
  );
}

export async function updateNotificationPrefs(
  userId: string,
  data: {
    emailInvites: boolean;
    emailAssignments: boolean;
    emailMentions: boolean;
    emailDueDate: boolean;
    emailStatusChange: boolean;
    inAppMentions: boolean;
    inAppAssignments: boolean;
    inAppStatusChange: boolean;
  },
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Due-date reminder job body: find issues assigned to users that are due within
 * the next 24h (or overdue since the last run) and notify + email.
 */
export async function runDueDateReminders(now = new Date()): Promise<{ notified: number }> {
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const issues = await prisma.issue.findMany({
    where: {
      deletedAt: null,
      dueDate: { not: null, lte: in24h },
      statusCategory: { not: "DONE" },
      assignees: { some: {} },
    },
    select: {
      id: true,
      key: true,
      title: true,
      dueDate: true,
      workspaceId: true,
      projectId: true,
      project: { select: { key: true, workspace: { select: { slug: true } } } },
      assignees: { select: { userId: true } },
    },
    take: 500,
  });

  let notified = 0;
  for (const issue of issues) {
    // Avoid re-notifying within 20h
    const since = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    for (const { userId } of issue.assignees) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          issueId: issue.id,
          type: "due_date",
          createdAt: { gte: since },
        },
      });
      if (existing) continue;

      const link = `/app/${issue.project.workspace.slug}/projects/${issue.project.key}/issues/${issue.key}`;
      await notify(prisma, {
        userId,
        workspaceId: issue.workspaceId,
        type: "due_date",
        title: `${issue.key} is due soon`,
        body: issue.title,
        link,
        issueId: issue.id,
      });

      if (await shouldEmail(userId, "due_date")) {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            await sendDueDateReminderEmail(user.email, user.name, [
              {
                key: issue.key,
                title: issue.title,
                dueDate: issue.dueDate!.toISOString(),
                link: `${process.env.APP_URL ?? ""}${link}`,
              },
            ]);
          }
        } catch (err) {
          logger.warn("reminders.email_failed", { err: String(err) });
        }
      }
      notified++;
    }
  }
  return { notified };
}
