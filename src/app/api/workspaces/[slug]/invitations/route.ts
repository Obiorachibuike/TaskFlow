import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { inviteMember, listInvitations } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return { invitations: await listInvitations(actor, slug) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return inviteMember(actor, slug, await req.json());
  }, req);
}
