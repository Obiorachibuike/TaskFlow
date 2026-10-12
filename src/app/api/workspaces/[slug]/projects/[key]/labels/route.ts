import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listLabels, createLabel, getProjectByKey } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const { project } = await getProjectByKey(actor, slug, key);
    return { labels: await listLabels(actor, slug, project.id) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const { project } = await getProjectByKey(actor, slug, key);
    const body = await req.json();
    return createLabel(actor, slug, { ...body, projectId: project.id });
  }, req);
}
