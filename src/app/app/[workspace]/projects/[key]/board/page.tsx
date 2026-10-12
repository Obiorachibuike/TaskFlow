import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { getBoard } from "@/lib/services/issue";
import { getProjectByKey, listLabels } from "@/lib/services/project";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { BoardPageClient } from "@/components/board/board-page-client";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ workspace: string; key: string }>;
}) {
  const { workspace: slug, key } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  const [board, labels, projects] = await Promise.all([
    getBoard(actor, slug, key),
    listLabels(actor, slug),
    prisma.project.findMany({
      where: { workspaceId: ctx.workspaceId, deletedAt: null },
      select: { key: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { user: { select: { id: true, name: true, avatarColor: true, image: true } } },
    take: 50,
  });

  return (
    <BoardPageClient
      data={board}
      workspaceSlug={slug}
      canEdit={can(ctx.role, "issue:update:restricted")}
      members={members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarColor: m.user.avatarColor,
        image: m.user.image,
      }))}
      labels={labels}
      projects={projects}
    />
  );
}

void getProjectByKey;
