import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { transferOwnership } from "@/lib/services/workspace";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    await transferOwnership(actor, slug, await req.json());
    return { ok: true };
  }, req);
}
