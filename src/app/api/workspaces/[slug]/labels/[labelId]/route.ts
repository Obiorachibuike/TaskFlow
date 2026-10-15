import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { deleteLabel } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; labelId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, labelId } = await ctx.params;
    await deleteLabel(actor, slug, labelId);
    return { ok: true };
  }, req);
}
