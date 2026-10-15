import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { workspaceDashboard } from "@/lib/services/analytics";
import { velocityReport } from "@/lib/services/sprint";
import { listProjects, projectMetrics } from "@/lib/services/project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StatusBars,
  PriorityBars,
  VelocityChart,
} from "@/components/charts/dashboard-charts";
import { UserAvatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  const [dash, velocity, projects] = await Promise.all([
    workspaceDashboard(actor, slug),
    velocityReport(actor, slug),
    listProjects(actor, slug),
  ]);

  const projectRows = await Promise.all(
    projects.map(async (p) => ({ project: p, metrics: await projectMetrics(p.id) })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted">
          All metrics are computed from live database records. Definitions in docs/METRICS.md.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Issues by status category</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBars data={dash.statusBreakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open issues by priority</CardTitle>
          </CardHeader>
          <CardContent>
            <PriorityBars data={dash.priorityBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Team velocity (story points per completed sprint)</CardTitle>
        </CardHeader>
        <CardContent>
          {velocity.sprints.length > 0 ? (
            <>
              <VelocityChart data={velocity.sprints} />
              <p className="mt-2 text-xs text-muted">
                Rolling average (last {Math.min(6, velocity.sprints.length)} sprints):{" "}
                <span className="font-medium text-foreground">{velocity.averageVelocity} pts</span>
              </p>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-faint">
              Complete at least one sprint to build velocity history.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {projectRows.length === 0 && (
            <p className="py-6 text-center text-sm text-faint">No projects to report on.</p>
          )}
          {projectRows.map(({ project, metrics }) => (
            <div key={project.id} className="rounded-lg border border-border-subtle p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: project.color }} />
                  <span className="font-medium">{project.name}</span>
                  <span className="font-mono text-xs text-faint">{project.key}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted">
                  <span>{metrics.openIssues} open</span>
                  <span>{metrics.doneIssues} done</span>
                  <span className={metrics.overdueIssues > 0 ? "text-danger" : ""}>
                    {metrics.overdueIssues} overdue
                  </span>
                  <span>{metrics.completionPct}% complete</span>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-primary to-secondary"
                  style={{ width: `${metrics.completionPct}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workload distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dash.workload.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3">
              <UserAvatar user={m.user} size="sm" />
              <div className="w-40">
                <p className="truncate text-sm">{m.user.name}</p>
                <p className="text-[11px] text-faint">{m.role.replace("_", " ")}</p>
              </div>
              <div className="flex-1">
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="bg-warning"
                    style={{ width: `${Math.min(50, m.openIssues * 8)}%` }}
                    title={`${m.openIssues} open`}
                  />
                  <div
                    className="bg-success"
                    style={{ width: `${Math.min(50, m.doneLast30Days * 8)}%` }}
                    title={`${m.doneLast30Days} done (30d)`}
                  />
                </div>
              </div>
              <div className="w-36 text-right text-xs text-muted">
                {m.openIssues} open · {m.doneLast30Days} done/30d
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
