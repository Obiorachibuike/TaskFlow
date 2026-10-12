import { redirect } from "next/navigation";
import { Rocket, PlayCircle, CheckCircle2, CalendarRange } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { getSprint, sprintReport } from "@/lib/services/sprint";
import { can } from "@/lib/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SprintControls } from "@/components/sprint/sprint-controls";
import { IssueCard } from "@/components/issue/issue-extras";
import { BurndownChart } from "@/components/charts/dashboard-charts";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let ctx;
  try {
    ctx = await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  const { sprint } = await getSprint(actor, id);
  const report = await sprintReport(actor, id);
  const done = sprint.issues.filter((i) => i.statusCategory === "DONE");
  const open = sprint.issues.filter((i) => i.statusCategory !== "DONE");

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{sprint.name}</h1>
            <Badge variant={sprint.status === "ACTIVE" ? "success" : sprint.status === "COMPLETED" ? "secondary" : "default"}>
              {sprint.status.toLowerCase()}
            </Badge>
            <Badge variant="outline">{sprint.project.name}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{sprint.goal ?? "No sprint goal set."}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-faint">
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
            </span>
            <span>
              {report.totals.completedIssues}/{report.totals.scopeIssues} issues done ·{" "}
              {report.totals.completedPoints}/{report.totals.scopePoints} pts
            </span>
          </div>
        </div>
        <SprintControls
          sprint={{
            id: sprint.id,
            status: sprint.status,
            projectId: sprint.projectId,
            projectKey: sprint.project.key,
          }}
          canManage={can(ctx.role, "sprint:manage")}
          nextSprints={[]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Scope issues", value: report.totals.scopeIssues, icon: CalendarRange },
          { label: "Completed", value: report.totals.completedIssues, icon: CheckCircle2 },
          { label: "Carried over", value: report.totals.carriedOver, icon: PlayCircle },
          { label: "Completion", value: `${report.totals.completionPct}%`, icon: Rocket },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2">
                <s.icon className="h-4 w-4 text-primary" />
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Burndown</CardTitle>
          </CardHeader>
          <CardContent>
            <BurndownChart data={report.burndown} />
            <p className="mt-2 text-xs text-faint">
              Remaining = scoped issues not in a Done category at day&apos;s end (from activity
              history). Dashed line is the ideal burndown.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scope changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {report.scopeChanges.length === 0 && (
              <p className="py-4 text-center text-sm text-faint">No scope changes recorded.</p>
            )}
            {report.scopeChanges.slice(-10).map((c, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="font-mono text-primary">{c.issueKey}</span>
                <span className={c.delta > 0 ? "text-success" : "text-danger"}>
                  {c.delta > 0 ? "added" : "removed"}
                </span>
                <span className="text-faint">{formatDate(c.date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">In progress / to do ({open.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {open.length === 0 && <p className="py-4 text-center text-sm text-faint">Nothing open — nice!</p>}
            {open.map((issue) => (
              <IssueCard key={issue.id} issue={issue} workspaceSlug={slug} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed ({done.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {done.length === 0 && <p className="py-4 text-center text-sm text-faint">No completed issues yet.</p>}
            {done.map((issue) => (
              <IssueCard key={issue.id} issue={issue} workspaceSlug={slug} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
