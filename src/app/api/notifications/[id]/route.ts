import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { markNotificationRead } from "@/lib/services/notifications";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const notification = await markNotificationRead(actor.userId, id);
    return { notification };
  }, req);
}
