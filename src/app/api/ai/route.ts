import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { runAiJob, listAiJobs, aiConfiguration } from "@/lib/services/ai";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const url = new URL(req.url);
    const workspace = url.searchParams.get("workspace");
    const config = aiConfiguration();
    if (!workspace) return { config, jobs: [] };
    return { config, jobs: await listAiJobs(actor, workspace) };
  }, req);
}

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    const body = await req.json();
    return runAiJob(actor, body.workspace, body);
  }, req);
}
