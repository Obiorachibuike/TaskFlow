import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { reorderBoardColumns } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    const body = await req.json();
    return { columns: await reorderBoardColumns(actor, slug, key, body.orderedIds ?? []) };
  }, req);
}
