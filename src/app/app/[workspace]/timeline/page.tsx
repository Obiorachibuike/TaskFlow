import { redirect } from "next/navigation";
import { GanttChartSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { issueStatusTimeline } from "@/lib/services/analytics";
import { listProjects } from "@/lib/services/project";
import { TimelineGantt } from "@/components/timeline/timeline-gantt";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  const [items, projects] = await Promise.all([
    issueStatusTimeline(actor, slug),
    listProjects(actor, slug),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted">
          Task schedule with dependencies, milestones, and overdue indicators.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={GanttChartSquare}
          title="No dated work yet"
          description="Give issues start and due dates to build the project timeline."
        />
      ) : (
        <TimelineGantt
          items={items.map((i) => ({
            id: i.id,
            key: i.key,
            title: i.title,
            type: i.type,
            statusCategory: i.statusCategory,
            priority: i.priority,
            startDate: i.startDate?.toISOString() ?? null,
            dueDate: i.dueDate?.toISOString() ?? null,
            project: i.project.name,
            projectKey: i.project.key,
            projectColor: i.project.color,
            assignees: i.assignees.map((a) => a.user.name),
            blockedBy: i.dependencies
              .filter((d) => d.blocker.statusCategory !== "DONE")
              .map((d) => d.blocker.key),
          }))}
          workspaceSlug={slug}
          projects={projects.map((p) => ({ key: p.key, name: p.name, color: p.color }))}
        />
      )}
    </div>
  );
}
