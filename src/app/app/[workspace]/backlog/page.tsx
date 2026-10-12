import { redirect } from "next/navigation";
import { Layers, Rocket } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { listIssuesInWorkspace } from "@/lib/services/issue";
import { listProjects } from "@/lib/services/project";
import { listSprints } from "@/lib/services/sprint";
import { can } from "@/lib/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { BacklogActions } from "@/components/sprint/backlog-actions";
import { IssueCard } from "@/components/issue/issue-extras";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { workspace: slug } = await params;
  const { p } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  const projects = await listProjects(actor, slug);
  const project = projects.find((x) => x.key === (p ?? "").toUpperCase()) ?? projects[0];
  if (!project) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Layers}
          title="No projects available"
          description="Create a project to start building your backlog."
        />
      </div>
    );
  }

  const [backlog, sprints] = await Promise.all([
    listIssuesInWorkspace(actor, slug, {
      projectId: project.id,
      includeDone: true,
      sort: "rank",
      dir: "asc",
      pageSize: 100,
    }),
    listSprints(actor, slug, project.key),
  ]);

  const unscheduled = backlog.items.filter((i) => !i.sprintId);
  const plannedSprints = sprints.filter((s) => s.status !== "COMPLETED");
  const editable = can(ctx.role, "sprint:content");

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Backlog</h1>
          <p className="text-sm text-muted">
            {project.name} · {unscheduled.length} unscheduled issue{unscheduled.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-border-subtle bg-surface px-3 text-sm"
            defaultValue={project.key}
            aria-label="Project"
          >
            {projects.map((x) => (
              <option key={x.id} value={x.key}>
                {x.name}
              </option>
            ))}
          </select>
          <BacklogActions
            workspaceSlug={slug}
            projectId={project.id}
            projectKey={project.key}
            sprints={plannedSprints.map((s) => ({ id: s.id, name: s.name }))}
            issueIds={unscheduled.map((i) => i.id)}
            editable={editable}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-muted" />
            Product backlog
            <Badge variant="secondary">{unscheduled.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {unscheduled.length === 0 && (
            <p className="py-6 text-center text-sm text-faint">
              Backlog is empty. Create issues from the board or the Create menu.
            </p>
          )}
          {unscheduled.map((issue) => (
            <IssueCard key={issue.id} issue={issue} workspaceSlug={slug} />
          ))}
        </CardContent>
      </Card>

      {plannedSprints.map((s) => {
        const items = backlog.items.filter((i) => i.sprintId === s.id);
        return (
          <Card key={s.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Rocket className="h-4 w-4 text-primary" />
                  {s.name}
                  <Badge variant={s.status === "ACTIVE" ? "success" : "default"}>{s.status.toLowerCase()}</Badge>
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {s.goal && <span className="max-w-[260px] truncate">🎯 {s.goal}</span>}
                  <span>
                    {formatDate(s.startDate)} – {formatDate(s.endDate)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.length === 0 && (
                <p className="py-4 text-center text-sm text-faint">
                  No issues in this sprint yet. Select issues below and add them.
                </p>
              )}
              {items.map((issue) => (
                <IssueCard key={issue.id} issue={issue} workspaceSlug={slug} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
