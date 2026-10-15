import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { velocityReport } from "@/lib/services/sprint";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    const projectKey = new URL(req.url).searchParams.get("projectKey") ?? undefined;
    return velocityReport(actor, slug, projectKey);
  }, req);
}
