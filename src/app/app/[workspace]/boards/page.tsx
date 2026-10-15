import Link from "next/link";
import { redirect } from "next/navigation";
import { KanbanSquare, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/services/project";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function BoardsIndexPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };
  const projects = await listProjects(actor, slug);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Boards</h1>
        <p className="text-sm text-muted">Pick a project to open its Kanban board.</p>
      </div>
      {projects.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="No projects to show"
          description="Create a project first — every project gets a configurable board."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/app/${slug}/projects/${p.key}/board`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ background: p.color }}
                  >
                    {p.icon ?? p.key.slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-faint">{p.key}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
