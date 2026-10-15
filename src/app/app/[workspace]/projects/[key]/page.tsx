import Link from "next/link";
import { redirect } from "next/navigation";
import {
  KanbanSquare,
  Layers,
  CalendarDays,
  BarChart3,
  Settings2,
  Target,
  Plus,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getProjectByKey, projectMetrics, listMilestones } from "@/lib/services/project";
import { listSprints } from "@/lib/services/sprint";
import { listIssuesInWorkspace } from "@/lib/services/issue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueCard } from "@/components/issue/issue-extras";
import { formatDate, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ workspace: string; key: string }>;
}) {
  const { workspace: slug, key } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  let project;
  try {
    ({ project } = await getProjectByKey(actor, slug, key));
  } catch {
    redirect(`/app/${slug}/projects`);
  }

  const [metrics, sprints, milestones, recent] = await Promise.all([
    projectMetrics(project.id),
    listSprints(actor, slug, key),
    listMilestones(actor, slug, key),
    listIssuesInWorkspace(actor, slug, {
      projectId: project.id,
      includeDone: true,
      sort: "updatedAt",
      dir: "desc",
      pageSize: 8,
    }),
  ]);

  const activeSprint = sprints.find((s) => s.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl text-white"
          style={{ background: project.color }}
        >
          {project.icon ?? project.key.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <Badge variant="secondary">{project.key}</Badge>
            <Badge variant={project.status === "ACTIVE" ? "success" : "secondary"}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">{project.description ?? "No description."}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-faint">
            {project.lead && <span>Lead: {project.lead.name}</span>}
            {project.startDate && <span>Start: {formatDate(project.startDate)}</span>}
            {project.targetDate && <span>Target: {formatDate(project.targetDate)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${slug}/projects/${project.key}/board`}>
              <KanbanSquare />
              Board
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${slug}/backlog?p=${project.key}`}>
              <Layers />
              Backlog
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${slug}/settings?tab=projects`}>
              <Settings2 />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Total issues", value: metrics.totalIssues },
          { label: "Completed", value: metrics.doneIssues },
          { label: "Open", value: metrics.openIssues },
          { label: "Overdue", value: metrics.overdueIssues, tone: "text-danger" },
          { label: "Completion", value: `${metrics.completionPct}%` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={cn("text-2xl font-semibold", s.tone)}>{s.value}</div>
              <div className="mt-1 text-xs text-muted">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted">
                <span>Issues</span>
                <span>
                  {metrics.doneIssues}/{metrics.totalIssues}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-success" style={{ width: `${metrics.completionPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted">
                <span>Story points</span>
                <span>
                  {metrics.storyPointsDone}/{metrics.storyPointsTotal}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{
                    width: `${metrics.storyPointsTotal === 0 ? 0 : Math.round((metrics.storyPointsDone / metrics.storyPointsTotal) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              {Object.entries(metrics.byType).map(([t, count]) => (
                <div key={t} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{t}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sprints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sprints.length === 0 && (
              <p className="py-4 text-center text-sm text-faint">No sprints yet.</p>
            )}
            {sprints.slice(0, 4).map((s) => (
              <Link
                key={s.id}
                href={`/app/${slug}/sprints/${s.id}`}
                className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2 text-sm hover:bg-surface-2"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-[11px] text-faint">
                    {formatDate(s.startDate)} – {formatDate(s.endDate)}
                  </p>
                </div>
                <Badge variant={s.status === "ACTIVE" ? "success" : s.status === "COMPLETED" ? "secondary" : "default"}>
                  {s.status.toLowerCase()}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {milestones.length === 0 && (
              <p className="py-4 text-center text-sm text-faint">
                No milestones. Add one from project settings.
              </p>
            )}
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm">
                <Target className="h-4 w-4 text-primary" />
                <span className="flex-1">{m.name}</span>
                <span className="text-xs text-muted">{formatDate(m.date)}</span>
              </div>
            ))}
            {activeSprint && (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary-soft/40 px-3 py-2 text-xs">
                <p className="font-medium text-primary">Active: {activeSprint.name}</p>
                <p className="mt-0.5 text-muted">{activeSprint.goal ?? "No goal set"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recently updated issues</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/app/${slug}/calendar`}>
                  <CalendarDays />
                  Calendar
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/app/${slug}/reports`}>
                  <BarChart3 />
                  Reports
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={`/app/${slug}/projects/${project.key}/board`}>
                  <Plus />
                  New issue
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {recent.items.map((issue) => (
            <IssueCard key={issue.id} issue={issue} workspaceSlug={slug} />
          ))}
          {recent.items.length === 0 && (
            <p className="col-span-2 py-6 text-center text-sm text-faint">
              No issues yet — create your first one from the board.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
