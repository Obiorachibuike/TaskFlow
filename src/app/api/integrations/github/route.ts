import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { connectGithub, disconnectGithub, listIntegrations } from "@/lib/integrations/github";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const workspace = new URL(req.url).searchParams.get("workspace");
    if (!workspace) return { integrations: [], configuration: {} };
    return listIntegrations(actor, workspace);
  }, req);
}

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    const body = await req.json();
    return connectGithub(actor, body.workspace, {
      token: body.token,
      repos: body.repos,
      name: body.name,
    });
  }, req);
}

export async function DELETE(req: NextRequest) {
  return handleApi(async (actor) => {
    const workspace = new URL(req.url).searchParams.get("workspace");
    if (!workspace) return { ok: true };
    await disconnectGithub(actor, workspace);
    return { ok: true };
  }, req);
}
