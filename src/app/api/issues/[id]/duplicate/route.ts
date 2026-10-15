import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { duplicateIssue } from "@/lib/services/issue";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    return duplicateIssue(actor, { issueId: id, title: body.title });
  }, req);
}
