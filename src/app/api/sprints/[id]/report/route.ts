import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { sprintReport } from "@/lib/services/sprint";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return sprintReport(actor, id);
  }, req);
}
