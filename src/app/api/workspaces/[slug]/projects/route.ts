import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listProjects, createProject } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return { projects: await listProjects(actor, slug) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return createProject(actor, slug, await req.json());
  }, req);
}
