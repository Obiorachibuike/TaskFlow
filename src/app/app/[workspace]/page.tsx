import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  UserCheck,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { workspaceDashboard } from "@/lib/services/analytics";
import { velocityReport } from "@/lib/services/sprint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/avatar";
import { StatusBars, PriorityBars, VelocityChart } from "@/components/charts/dashboard-charts";
import { formatDate, timeAgo, isOverdue, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }: { params: Promise<{ workspace: string }> }) {
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

  const [dash, velocity] = await Promise.all([
    workspaceDashboard(actor, slug),
    velocityReport(actor, slug),
  ]);

  const stats = [
    { label: "Projects", value: dash.totals.projects, icon: FolderKanban, tone: "text-primary" },
    { label: "Open issues", value: dash.totals.openIssues, icon: CircleDot, tone: "text-warning" },
    { label: "Completed", value: dash.totals.completedIssues, icon: CheckCircle2, tone: "text-success" },
    { label: "Overdue", value: dash.totals.overdueIssues, icon: AlertTriangle, tone: "text-danger" },
    { label: "Assigned to me", value: dash.totals.myAssigned, icon: UserCheck, tone: "text-secondary" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">
          {ctx.name} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2">
                <s.icon className={cn("h-4 w-4", s.tone)} />
              </div>
              <div>
                <div className="text-2xl font-semibold leading-none">{s.value}</div>
                <div className="mt-1 text-xs text-muted">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Issues by status</CardTitle>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sprint velocity</CardTitle>
          </CardHeader>
          <CardContent>
            {velocity.sprints.length > 0 ? (
              <>
                <VelocityChart data={velocity.sprints.slice(-6)} />
                <p className="mt-2 text-xs text-muted">
                  Average velocity: <span className="font-medium text-foreground">{velocity.averageVelocity} pts</span> over the last{" "}
                  {Math.min(6, velocity.sprints.length)} sprint(s)
                </p>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-faint">
                Complete sprints to see velocity trends.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upcoming deadlines (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.upcomingDeadlines.length === 0 && (
              <p className="py-6 text-center text-sm text-faint">Nothing due this week.</p>
            )}
            {dash.upcomingDeadlines.map((i) => (
              <Link
                key={i.id}
                href={`/app/${i.project.workspace.slug}/projects/${i.project.key}/issues/${i.key}`}
                className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="font-mono text-xs text-primary">{i.key}</span>
                <span className="flex-1 truncate text-sm">{i.title}</span>
                <Badge variant={isOverdue(i.dueDate) ? "danger" : "secondary"}>
                  {formatDate(i.dueDate)}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Project progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dash.projectProgress.length === 0 && (
              <p className="py-6 text-center text-sm text-faint">Create a project to see progress.</p>
            )}
            {dash.projectProgress.map((p) => (
              <Link key={p.id} href={`/app/${slug}/projects/${p.key}`} className="block">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: p.color }}
                    />
                    {p.name}
                  </span>
                  <span className="text-xs text-muted">
                    {p.doneIssues}/{p.totalIssues} · {p.completionPct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${p.completionPct}%` }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Team workload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dash.workload.map((m) => (
              <div key={m.user.id} className="flex items-center gap-2.5">
                <UserAvatar user={m.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.user.name}</p>
                  <p className="text-[11px] text-faint">
                    {m.openIssues} open · {m.doneLast30Days} done (30d)
                  </p>
                </div>
                <div className="h-1.5 w-20 rounded-full bg-surface-2">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, m.openIssues * 12)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active sprints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.sprintCompletion.length === 0 && (
              <p className="py-6 text-center text-sm text-faint">No active sprints.</p>
            )}
            {dash.sprintCompletion.map((s) => (
              <Link
                key={s.sprintId}
                href={`/app/${slug}/sprints/${s.sprintId}`}
                className="block rounded-md border border-border-subtle px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.doneIssues}/{s.totalIssues} done · ends {formatDate(s.endDate)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-success" style={{ width: `${s.completionPct}%` }} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.recentActivity.length === 0 && (
              <p className="py-6 text-center text-sm text-faint">No activity yet.</p>
            )}
            {dash.recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 text-sm">
                <UserAvatar user={a.actor} size="xs" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-muted">
                    <span className="font-medium text-foreground">{a.actor.name}</span>{" "}
                    {a.type.replace(/[._]/g, " ")}
                    {a.issue ? (
                      <>
                        {" · "}
                        <span className="font-mono text-xs text-primary">{a.issue.key}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-faint">{timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
