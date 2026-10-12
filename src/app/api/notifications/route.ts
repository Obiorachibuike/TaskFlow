import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listNotifications, unreadCount, markAllNotificationsRead } from "@/lib/services/notifications";
import { requireWorkspaceMembership } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const workspace = new URL(req.url).searchParams.get("workspace");
    if (!workspace) return { notifications: [], unread: 0 };
    const ws = await requireWorkspaceMembership(actor, workspace);
    const unreadOnly = new URL(req.url).searchParams.get("unreadOnly") === "1";
    const [notifications, unread] = await Promise.all([
      listNotifications(actor.userId, ws.workspaceId, { unreadOnly }),
      unreadCount(actor.userId, ws.workspaceId),
    ]);
    return { notifications, unread };
  }, req);
}

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    const body = await req.json();
    if (body.action === "markAllRead") {
      const ws = await requireWorkspaceMembership(actor, body.workspace);
      const count = await markAllNotificationsRead(actor.userId, ws.workspaceId);
      return { marked: count };
    }
    return { ok: true };
  }, req);
}
