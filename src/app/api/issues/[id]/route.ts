import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { getIssueByKey, updateIssue, deleteIssue } from "@/lib/services/issue";
import { listComments } from "@/lib/services/comment";
import { requireWorkspaceMembership } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    // id may be the issue key (NOVA-1) or internal id; support both
    if (id.includes("-") && /^[A-Z][A-Z0-9]*-\d+$/i.test(id)) {
      const workspace = new URL(req.url).searchParams.get("workspace");
      if (!workspace) return getIssueByInternal(actor, id);
      const { issue, ctx: wsCtx } = await getIssueByKey(actor, workspace, id);
      return { issue, role: wsCtx.role, comments: await listComments(actor, issue.id) };
    }
    return getIssueByInternal(actor, id);
  }, req);
}

async function getIssueByInternal(actor: Parameters<Parameters<typeof handleApi>[0]>[0], id: string) {
  const issue = await (await import("@/lib/prisma")).prisma.issue.findFirst({
    where: { id, deletedAt: null },
    select: { key: true, workspaceId: true },
  });
  if (!issue) return { issue: null };
  const ws = await requireWorkspaceMembership(actor, issue.workspaceId);
  const result = await getIssueByKey(actor, ws.slug, issue.key);
  return { issue: result.issue, role: result.ctx.role, comments: await listComments(actor, result.issue.id) };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return updateIssue(actor, id, await req.json());
  }, req);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    await deleteIssue(actor, id);
    return { ok: true };
  }, req);
}
