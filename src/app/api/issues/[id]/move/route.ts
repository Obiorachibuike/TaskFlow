import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { moveIssue } from "@/lib/services/issue";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const body = await req.json();
    return moveIssue(actor, { ...body, issueId: id });
  }, req);
}
