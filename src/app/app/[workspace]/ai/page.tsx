import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { listProjects } from "@/lib/services/project";
import { listIssuesInWorkspace } from "@/lib/services/issue";
import { listSprints } from "@/lib/services/sprint";
import { aiConfiguration } from "@/lib/services/ai";
import { AiAssistant } from "@/components/ai/ai-assistant";

export const dynamic = "force-dynamic";

export default async function AiPage({ params }: { params: Promise<{ workspace: string }> }) {
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

  const [projects, sprints, issues] = await Promise.all([
    listProjects(actor, slug),
    listSprints(actor, slug),
    listIssuesInWorkspace(actor, slug, { includeDone: true, pageSize: 60, sort: "updatedAt", dir: "desc" }),
  ]);

  const config = aiConfiguration();

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Bot className="h-5 w-5 text-primary" />
          AI Assistant
        </h1>
        <p className="text-sm text-muted">
          Summarize work, generate tasks, and get recommendations. AI proposes — you confirm every
          change before it is applied.
        </p>
      </div>

      <AiAssistant
        workspaceSlug={slug}
        config={config}
        projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
        sprints={sprints.map((s) => ({ id: s.id, name: s.name, projectId: s.projectId }))}
        issues={issues.items.map((i) => ({
          id: i.id,
          key: i.key,
          title: i.title,
          projectId: i.projectId,
        }))}
        canApply={ctx.role !== "VIEWER"}
      />
    </div>
  );
}

void listIssuesInWorkspace;
