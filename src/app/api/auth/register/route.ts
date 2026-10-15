import { NextResponse, type NextRequest } from "next/server";
import { registerAccount } from "@/lib/services/account";
import { errorResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = await registerAccount(body);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
