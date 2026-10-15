import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/services/workspace";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { listProjects } from "@/lib/services/project";
import { unreadCount } from "@/lib/services/notifications";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { RealtimeProvider } from "@/components/app/realtime-provider";
import { isServiceError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceSlug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(
      { userId: user.id, name: user.name, email: user.email },
      workspaceSlug,
    );
  } catch (err) {
    if (isServiceError(err) && err.code === "NOT_FOUND") redirect("/app");
    throw err;
  }

  const [workspaces, projects, unread] = await Promise.all([
    listWorkspacesForUser(user.id),
    listProjects({ userId: user.id, name: user.name, email: user.email }, workspaceSlug),
    unreadCount(user.id, ctx.workspaceId),
  ]);

  const current = workspaces.find((w) => w.slug === workspaceSlug) ?? {
    id: ctx.workspaceId,
    name: ctx.name,
    slug: ctx.slug,
    icon: null,
    color: "#6366F1",
    role: ctx.role,
    _count: { projects: 0, members: 0 },
    members: [],
    createdById: user.id,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const summaries = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    icon: w.icon,
    color: w.color,
    role: w.members[0]?.role ?? "VIEWER",
  }));

  return (
    <RealtimeProvider workspaceSlug={ctx.slug} workspaceId={ctx.workspaceId}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar workspaces={summaries} current={{ ...current, role: ctx.role }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            workspaceSlug={ctx.slug}
            crumbs={[{ label: ctx.name, href: `/app/${ctx.slug}` }]}
            user={{
              name: user.name,
              email: user.email,
              image: user.image,
              avatarColor: user.avatarColor,
            }}
            projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name, icon: p.icon }))}
            unread={unread}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
