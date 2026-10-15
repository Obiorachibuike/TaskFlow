import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordReset, resendVerificationEmail } from "@/lib/services/account";
import { errorResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.mode === "resend-verification" && typeof body.email === "string") {
      await resendVerificationEmail(body.email);
    } else {
      await requestPasswordReset(body);
    }
    // Always the same response — no account enumeration
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
