import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listSprints, createSprint } from "@/lib/services/sprint";
import { getProjectByKey } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    return { sprints: await listSprints(actor, slug, key) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const { project } = await getProjectByKey(actor, slug, key);
    const body = await req.json();
    return createSprint(actor, { ...body, projectId: project.id });
  }, req);
}
