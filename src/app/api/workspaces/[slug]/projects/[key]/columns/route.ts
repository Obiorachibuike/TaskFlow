import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listBoardColumns, createBoardColumn } from "@/lib/services/project";

type Ctx = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    return { columns: await listBoardColumns(actor, slug, key) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug, key } = await ctx.params;
    return createBoardColumn(actor, slug, key, await req.json());
  }, req);
}
