import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { updateComment, deleteComment } from "@/lib/services/comment";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const body = await req.json();
    return updateComment(actor, { commentId: id, body: body.body });
  }, req);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    await deleteComment(actor, id);
    return { ok: true };
  }, req);
}
