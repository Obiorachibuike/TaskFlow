import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { uploadAttachment, listIssueAttachments } from "@/lib/services/attachment";
import { ServiceError } from "@/lib/errors";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    return { attachments: await listIssueAttachments(actor, id) };
  }, req);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handleApi(async (actor) => {
    const { id } = await ctx.params;
    const issue = await prisma.issue.findFirst({
      where: { id, deletedAt: null },
      select: { workspaceId: true },
    });
    if (!issue) throw new Error("Issue not found");
    const ws = await requireWorkspaceMembership(actor, issue.workspaceId);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ServiceError("VALIDATION", "file field is required");
    }
    const data = Buffer.from(await file.arrayBuffer());
    return uploadAttachment(actor, ws.slug, {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      data,
      issueId: id,
    });
  }, req);
}
