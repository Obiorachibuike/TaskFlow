import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/services/project";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateProjectButton } from "@/components/project/create-project-button";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warning" | "secondary" | "danger" | "default"> = {
  ACTIVE: "success",
  PLANNED: "default",
  ON_HOLD: "warning",
  COMPLETED: "secondary",
  CANCELLED: "danger",
};

export default async function ProjectsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };
  const projects = await listProjects(actor, slug);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">{projects.length} project{projects.length === 1 ? "" : "s"} in this workspace</p>
        </div>
        <CreateProjectButton workspaceSlug={slug} />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start tracking issues, sprints, and progress."
          action={<CreateProjectButton workspaceSlug={slug} />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/app/${slug}/projects/${p.key}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white"
                      style={{ background: p.color }}
                    >
                      {p.icon ?? p.key.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium">{p.name}</h3>
                        <Badge variant={STATUS_TONE[p.status] ?? "secondary"}>{p.status.replace("_", " ")}</Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-faint">{p.key}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description ?? "No description"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                    <span>{p._count.issues} issues</span>
                    {p.targetDate ? <span>Target {formatDate(p.targetDate)}</span> : <span>—</span>}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{
                        width: `${p._count.issues === 0 ? 0 : Math.min(100, (p._count.issues / Math.max(p._count.issues, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          <CreateProjectButton workspaceSlug={slug} variant="card" />
        </div>
      )}
    </div>
  );
}

void Plus;
