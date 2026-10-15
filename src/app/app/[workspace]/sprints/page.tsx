import Link from "next/link";
import { redirect } from "next/navigation";
import { Rocket, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { listSprints } from "@/lib/services/sprint";
import { listProjects } from "@/lib/services/project";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SprintsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = { userId: user.id, name: user.name, email: user.email };

  try {
    await requireWorkspaceMembership(actor, slug);
  } catch {
    redirect("/app");
  }

  const [sprints, projects] = await Promise.all([
    listSprints(actor, slug),
    listProjects(actor, slug),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sprints</h1>
        <p className="text-sm text-muted">Plan, run, and complete sprints across projects.</p>
      </div>

      {sprints.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No sprints yet"
          description="Create a sprint from a project backlog to start planning iterations."
          action={
            <Link href={`/app/${slug}/backlog`} className="text-sm text-primary hover:underline">
              Go to backlog →
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {sprints.map((s) => (
            <Link key={s.id} href={`/app/${slug}/sprints/${s.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
                    <Rocket className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{s.name}</h3>
                      <Badge
                        variant={
                          s.status === "ACTIVE" ? "success" : s.status === "COMPLETED" ? "secondary" : "default"
                        }
                      >
                        {s.status.toLowerCase()}
                      </Badge>
                      <Badge variant="outline">{s.project.name}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(s.startDate)} – {formatDate(s.endDate)} · {s._count.issues} issues
                    </p>
                    {s.goal && <p className="mt-1 truncate text-xs text-faint">🎯 {s.goal}</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-4 text-xs text-muted">
        <p className="font-medium text-foreground">How sprint metrics work</p>
        <p className="mt-1">
          Burndown counts issues not yet in a Done board category at the end of each day, reconstructed
          from persisted activity history. Velocity is the story points of issues completed in a sprint.
          See <span className="font-mono">docs/METRICS.md</span> for full definitions.
        </p>
      </div>

      <div className="text-xs text-faint">
        Projects: {projects.map((p) => p.name).join(", ") || "none"}
      </div>
    </div>
  );
}
