import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { workspaceDashboard } from "@/lib/services/analytics";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { slug } = await ctx.params;
    return workspaceDashboard(actor, slug);
  }, req);
}
