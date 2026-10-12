import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { addIssuesToSprint } from "@/lib/services/sprint";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const body = await req.json();
    return addIssuesToSprint(actor, { ...body, sprintId: id });
  }, req);
}
