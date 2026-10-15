import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listComments, createComment } from "@/lib/services/comment";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return { comments: await listComments(actor, id) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const body = await req.json();
    return createComment(actor, { ...body, issueId: id });
  }, req);
}
