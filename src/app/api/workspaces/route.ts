import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listWorkspacesForUser, createWorkspace } from "@/lib/services/workspace";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const items = await listWorkspacesForUser(actor.userId);
    return {
      workspaces: items.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        icon: w.icon,
        color: w.color,
        role: w.members[0]?.role ?? "VIEWER",
        projectCount: w._count.projects,
        memberCount: w._count.members,
      })),
    };
  }, req);
}

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => createWorkspace(actor, await req.json()), req);
}
