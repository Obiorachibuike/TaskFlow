import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { listMembers, listInvitations } from "@/lib/services/workspace";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  const [members, invitations] = await Promise.all([
    listMembers(ctx.workspaceId),
    can(ctx.role, "invitation:manage") ? listInvitations(actor, slug) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Workspace, members, and personal preferences.</p>
      </div>

      <SettingsTabs
        workspaceSlug={slug}
        workspace={{
          id: ctx.workspaceId,
          name: ctx.name,
          description: null,
          icon: null,
          color: "#6366F1",
          slug: ctx.slug,
        }}
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
          inviter: i.inviter,
        }))}
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          avatarColor: user.avatarColor,
          timeZone: user.timeZone,
        }}
        canManage={can(ctx.role, "workspace:manage")}
        isOwner={ctx.role === "OWNER"}
      />
    </div>
  );
}
