import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listMembers, inviteMember } from "@/lib/services/workspace";
import { requireWorkspaceMembership } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    const ws = await requireWorkspaceMembership(actor, slug);
    return { members: await listMembers(ws.workspaceId) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return inviteMember(actor, slug, await req.json());
  }, req);
}
