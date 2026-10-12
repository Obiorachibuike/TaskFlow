import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { updateMemberRole, removeMember } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string; memberId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, memberId } = await ctx.params;
    const body = await req.json();
    return updateMemberRole(actor, slug, { memberId, role: body.role });
  }, req);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, memberId } = await ctx.params;
    await removeMember(actor, slug, memberId);
    return { ok: true };
  }, req);
}
