import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { startSprint } from "@/lib/services/sprint";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return startSprint(actor, id);
  }, req);
}
