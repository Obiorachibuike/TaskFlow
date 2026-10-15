import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { updateBoardColumn, deleteBoardColumn } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string; columnId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, columnId } = await ctx.params;
    return updateBoardColumn(actor, slug, columnId, await req.json());
  }, req);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, columnId } = await ctx.params;
    await deleteBoardColumn(actor, slug, columnId);
    return { ok: true };
  }, req);
}
