import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { applyAiJob } from "@/lib/services/ai";

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    const body = await req.json();
    return applyAiJob(actor, body.workspace, body);
  }, req);
}
