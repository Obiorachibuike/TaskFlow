import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { issueStatusTimeline } from "@/lib/services/analytics";
import { listProjects } from "@/lib/services/project";
import { CalendarView, type CalendarIssue } from "@/components/timeline/calendar-view";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  const [items, projects] = await Promise.all([
    issueStatusTimeline(actor, slug),
    listProjects(actor, slug),
  ]);

  const issues: CalendarIssue[] = items.map((i) => ({
    id: i.id,
    key: i.key,
    title: i.title,
    status: i.status,
    statusCategory: i.statusCategory,
    priority: i.priority,
    startDate: i.startDate?.toISOString() ?? null,
    dueDate: i.dueDate?.toISOString() ?? null,
    project: {
      key: i.project.key,
      name: i.project.name,
      color: i.project.color,
      workspace: i.project.workspace,
    },
    assignees: i.assignees.map((a) => ({ user: { name: a.user.name, avatarColor: a.user.avatarColor } })),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted">Deadlines and scheduled work across the workspace.</p>
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled"
          description="Add start or due dates to issues to see them on the calendar."
        />
      ) : (
        <CalendarView
          issues={issues}
          workspaceSlug={slug}
          filters={{ project: "all", assignee: "all" }}
          onFilters={() => {}}
          projects={projects.map((p) => ({ key: p.key, name: p.name }))}
        />
      )}
    </div>
  );
}
