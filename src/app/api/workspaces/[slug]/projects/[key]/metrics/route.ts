import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getProjectByKey, projectMetrics } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const { project } = await getProjectByKey(actor, slug, key);
    return projectMetrics(project.id);
  }, req);
}
