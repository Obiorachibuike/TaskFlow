import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { removeDependency } from "@/lib/services/issue";

type Ctx = { params: Promise<{ id: string; depId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id, depId } = await ctx.params;
    await removeDependency(actor, id, depId);
    return { ok: true };
  }, req);
}
