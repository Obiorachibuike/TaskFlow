import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getSprint, updateSprint } from "@/lib/services/sprint";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const { sprint } = await getSprint(actor, id);
    return { sprint };
  }, req);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return updateSprint(actor, id, await req.json());
  }, req);
}
