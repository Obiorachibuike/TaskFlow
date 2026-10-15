import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getNotificationPrefs, updateNotificationPrefs } from "@/lib/services/notifications";
import { notificationPrefsSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => getNotificationPrefs(actor.userId), req);
}

export async function PUT(req: NextRequest) {
  return handleApi(async (actor) => {
    const data = notificationPrefsSchema.parse(await req.json());
    return updateNotificationPrefs(actor.userId, data);
  }, req);
}
