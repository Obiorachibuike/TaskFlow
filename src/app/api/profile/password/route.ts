import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { changePassword } from "@/lib/services/account";

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    await changePassword(actor, await req.json());
    return { ok: true };
  }, req);
}
