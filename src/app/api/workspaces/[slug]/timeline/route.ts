import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { issueStatusTimeline } from "@/lib/services/analytics";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
    return { items: await issueStatusTimeline(actor, slug, projectId) };
  }, req);
}
