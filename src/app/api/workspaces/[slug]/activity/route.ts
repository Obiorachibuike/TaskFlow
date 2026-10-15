import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listWorkspaceActivity } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    return { activity: await listWorkspaceActivity(actor, slug, { limit, projectId }) };
  }, req);
}
