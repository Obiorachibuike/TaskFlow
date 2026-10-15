import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { revokeInvitation } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, id } = await ctx.params;
    await revokeInvitation(actor, slug, id);
    return { ok: true };
  }, req);
}
