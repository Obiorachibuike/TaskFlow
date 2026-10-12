import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { updateProfile } from "@/lib/services/account";

export async function PATCH(req: NextRequest) {
  return handleApi(async (actor) => updateProfile(actor, await req.json()), req);
}
