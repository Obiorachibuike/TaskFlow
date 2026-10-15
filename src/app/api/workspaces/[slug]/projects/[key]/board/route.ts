import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getBoard } from "@/lib/services/issue";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    return getBoard(actor, slug, key);
  }, req);
}
