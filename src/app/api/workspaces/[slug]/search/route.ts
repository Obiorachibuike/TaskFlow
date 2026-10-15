import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { globalSearch } from "@/lib/services/analytics";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return globalSearch(actor, slug, q);
  }, req);
}
