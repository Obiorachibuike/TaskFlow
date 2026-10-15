import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getProjectByKey, updateProject, deleteProject, projectMetrics } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const { project } = await getProjectByKey(actor, slug, key);
    return { project, metrics: await projectMetrics(project.id) };
  }, req);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    return updateProject(actor, slug, key, await req.json());
  }, req);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    await deleteProject(actor, slug, key);
    return { ok: true };
  }, req);
}
