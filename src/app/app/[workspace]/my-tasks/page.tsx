import { redirect } from "next/navigation";
import { ListTodo } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { myIssues } from "@/lib/services/issue";
import { IssueCard } from "@/components/issue/issue-extras";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function MyTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { workspace: slug } = await params;
  const { done } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  const issues = await myIssues(actor, slug, { includeDone: done === "1" });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Tasks</h1>
          <p className="text-sm text-muted">
            {issues.length} {done === "1" ? "total" : "open"} issue{issues.length === 1 ? "" : "s"} assigned to you
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/app/${slug}/my-tasks`}
            className={`rounded-md px-3 py-1.5 text-sm ${done !== "1" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2"}`}
          >
            Open
          </a>
          <a
            href={`/app/${slug}/my-tasks?done=1`}
            className={`rounded-md px-3 py-1.5 text-sm ${done === "1" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2"}`}
          >
            All
          </a>
        </div>
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks assigned to you"
          description="When someone assigns you an issue, it will show up here."
        />
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-center gap-3">
              <div className="flex-1">
                <IssueCard issue={issue} workspaceSlug={slug} />
              </div>
              <Badge variant={issue.statusCategory === "DONE" ? "success" : "secondary"}>
                {issue.status.replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
