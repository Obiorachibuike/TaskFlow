import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getIssueByKey } from "@/lib/services/issue";
import { prisma } from "@/lib/prisma";
import { IssuePanel } from "@/components/issue/issue-panel";
import { isServiceError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; key: string; issueKey: string }>;
}) {
  const { workspace: slug, key, issueKey } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  try {
    await getIssueByKey(actor, slug, issueKey);
  } catch (err) {
    if (isServiceError(err) && err.code === "NOT_FOUND") {
      redirect(`/app/${slug}/projects/${key}/board`);
    }
    throw err;
  }

  const [members, columns] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, name: true, avatarColor: true, image: true } } },
      take: 50,
    }),
    prisma.boardColumn.findMany({
      where: { project: { key: key.toUpperCase(), workspaceId: ctx.workspaceId } },
      orderBy: { position: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <IssuePanel
        variant="page"
        issueId={issueKey}
        workspaceSlug={slug}
        canEdit={can(ctx.role, "issue:update:restricted")}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          avatarColor: m.user.avatarColor,
          image: m.user.image,
        }))}
        columns={columns.map((c) => ({ key: c.key, name: c.name, category: c.category }))}
      />
    </div>
  );
}
