import { type NextRequest } from "next/server";
import { handleApi, errorResponse } from "@/lib/api";
import { getInvitationByToken, acceptInvitation } from "@/lib/services/workspace";
import { requireUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ token: string }> };

/** Public preview of an invitation (no auth) so we can show workspace name. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const inv = await getInvitationByToken(token);
    return NextResponse.json({
      workspace: inv.workspace,
      inviter: inv.inviter,
      role: inv.role,
      email: inv.email,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { token } = await ctx.params;
    return acceptInvitation(actor, token);
  }, req);
}

void requireUser;
