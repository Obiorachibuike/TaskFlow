import { redirect } from "next/navigation";
import { Plug, GitBranch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { listIntegrations } from "@/lib/integrations/github";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GithubConnect } from "@/components/integrations/github-connect";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
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

  const { integrations, configuration } = await listIntegrations(actor, slug);
  const github = integrations.find((i) => i.type === "GITHUB");
  const manage = can(ctx.role, "integration:manage");

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted">
          Connect external tools to bring development activity into your issues.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4" />
            GitHub
            {github ? (
              <Badge variant="success" className="ml-2">
                connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                not connected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Link branches, commits, and pull requests to issue keys (e.g.{" "}
            <code className="rounded bg-surface-2 px-1">NOVA-104-fix-login</code>). Webhooks are
            verified with HMAC signatures. A PR being open or merged never automatically completes an
            issue — status changes stay under your team&apos;s control.
          </p>
          <GithubConnect
            workspaceSlug={slug}
            connected={!!github}
            config={configuration as { oauthEnabled: boolean; webhooksEnabled: boolean; tokenStorageEnabled: boolean; setupMessage: string | null }}
            canManage={manage}
            repos={((github?.config as { repos?: string[] } | null)?.repos ?? [])}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-muted" />
            More integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Slack, Jira import, and CI providers are on the roadmap. The integration system is
            extensible — see <code className="rounded bg-surface-2 px-1">docs/GITHUB_SETUP.md</code>{" "}
            for how connections, encrypted secrets, and webhooks are structured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
