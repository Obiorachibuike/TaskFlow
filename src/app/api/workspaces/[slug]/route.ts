import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { updateWorkspace, getWorkspaceContext } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return getWorkspaceContext(actor, slug);
  }, req);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return updateWorkspace(actor, slug, await req.json());
  }, req);
}
