import { NextResponse, type NextRequest } from "next/server";
import { resetPassword } from "@/lib/services/account";
import { errorResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await resetPassword(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
