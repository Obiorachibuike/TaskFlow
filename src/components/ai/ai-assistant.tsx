"use client";

/**
 * AI assistant UI. Shows a clear setup message when no provider is configured.
 * Results are structured and only applied after explicit user confirmation
 * (checkbox selection + "Apply selected" button).
 */
import * as React from "react";
import {
  Bot,
  Loader2,
  Sparkles,
  CheckSquare,
  Square,
  AlertTriangle,
  Settings2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  { id: "summarize_project", label: "Summarize project", needs: "project", applyable: false },
  { id: "summarize_discussion", label: "Summarize issue discussion", needs: "issue", applyable: false },
  { id: "generate_tasks", label: "Generate tasks from description", needs: "project", applyable: true },
  { id: "break_down_epic", label: "Break down epic", needs: "issue", applyable: true },
  { id: "suggest_priorities", label: "Suggest priorities", needs: "project", applyable: true },
  { id: "recommend_sprint", label: "Recommend sprint contents", needs: "project", applyable: false },
  { id: "explain_overdue", label: "Explain overdue work", needs: "project", applyable: false },
  { id: "scheduling_risks", label: "Identify scheduling risks", needs: "project", applyable: false },
  { id: "next_task", label: "Recommend next task", needs: "project", applyable: false },
] as const;

interface AiJobResult {
  id: string;
  capability: string;
  status: string;
  output: unknown;
  error: string | null;
  createdAt: string;
  tokensUsed: number | null;
}

export function AiAssistant({
  workspaceSlug,
  config,
  projects,
  issues,
  canApply,
}: {
  workspaceSlug: string;
  config: { configured: boolean; provider: string; model: string | null; setupMessage: string | null };
  projects: Array<{ id: string; key: string; name: string }>;
  sprints: Array<{ id: string; name: string; projectId: string }>;
  issues: Array<{ id: string; key: string; title: string; projectId: string }>;
  canApply: boolean;
}) {
  const [capability, setCapability] = React.useState<string>("summarize_project");
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [issueId, setIssueId] = React.useState(issues[0]?.id ?? "");
  const [description, setDescription] = React.useState("");
  const [criteria, setCriteria] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<AiJobResult | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [applying, setApplying] = React.useState(false);
  const { toast } = useToast();

  const cap = CAPABILITIES.find((c) => c.id === capability)!;

  async function run() {
    setBusy(true);
    setResult(null);
    setSelected(new Set());
    try {
      const job = await apiFetch<AiJobResult>("/api/ai", {
        method: "POST",
        json: {
          workspace: workspaceSlug,
          capability,
          projectId: cap.needs === "project" ? projectId : undefined,
          issueId: cap.needs === "issue" ? issueId : undefined,
          description: description || undefined,
          criteria: criteria || undefined,
        },
      });
      setResult(job);
      if (job.status === "COMPLETED") {
        toast({ variant: "success", title: "AI response ready", description: "Review before applying anything." });
      }
    } catch (err) {
      toast({ variant: "error", title: "AI request failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    try {
      const res = await apiFetch<{ created?: Array<{ key: string }>; updated?: string[] }>("/api/ai/apply", {
        method: "POST",
        json: {
          workspace: workspaceSlug,
          jobId: result.id,
          selection: [...selected].map(String),
        },
      });
      const summary = res.created
        ? `Created ${res.created.length} issue(s): ${res.created.map((c) => c.key).join(", ")}`
        : `Updated ${res.updated?.length ?? 0} issue(s)`;
      toast({ variant: "success", title: "Applied", description: summary });
      setSelected(new Set());
    } catch (err) {
      toast({ variant: "error", title: "Could not apply", description: errorMessage(err) });
    } finally {
      setApplying(false);
    }
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const output = result?.output as Record<string, unknown> | undefined;
  const proposedItems: Array<Record<string, unknown>> =
    (output?.tasks as Array<Record<string, unknown>>) ??
    (output?.stories as Array<Record<string, unknown>>) ??
    (output?.suggestions as Array<Record<string, unknown>>) ??
    [];

  return (
    <div className="space-y-4">
      {!config.configured && (
        <Card className="border-warning/40 bg-warning-soft/30">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">AI provider not configured</p>
              <p className="mt-1 text-sm text-muted">{config.setupMessage}</p>
              <p className="mt-2 text-xs text-faint">
                Add <code className="rounded bg-surface-2 px-1">AI_PROVIDER</code> and{" "}
                <code className="rounded bg-surface-2 px-1">AI_API_KEY</code> (or{" "}
                <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code>) to the server
                environment, then restart. TaskFlow never fabricates AI responses.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Run a capability
            {config.configured && (
              <Badge variant="secondary" className="ml-auto">
                {config.provider}
                {config.model ? ` · ${config.model}` : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Capability</Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPABILITIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cap.needs === "project" && (
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {cap.needs === "issue" && (
              <div className="space-y-1.5">
                <Label>Issue</Label>
                <Select value={issueId} onValueChange={setIssueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select issue" />
                  </SelectTrigger>
                  <SelectContent>
                    {issues.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.key} — {i.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {capability === "generate_tasks" && (
            <div className="space-y-1.5">
              <Label>Feature description</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the feature to break into tasks…"
              />
            </div>
          )}

          {capability === "next_task" && (
            <div className="space-y-1.5">
              <Label>Selection criteria</Label>
              <Textarea
                rows={2}
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder="e.g. highest impact unblocked work that fits a half day"
              />
            </div>
          )}

          <Button onClick={run} disabled={busy || !config.configured}>
            {busy ? <Loader2 className="animate-spin" /> : <Zap />}
            {busy ? "Working…" : "Run"}
          </Button>
        </CardContent>
      </Card>

      {result?.status === "FAILED" && (
        <Card className="border-danger/40">
          <CardContent className="p-4">
            <p className="text-sm text-danger">{result.error ?? "The AI request failed."}</p>
          </CardContent>
        </Card>
      )}

      {result?.status === "COMPLETED" && output && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot className="h-4 w-4 text-primary" />
                Result
                {result.tokensUsed != null && (
                  <Badge variant="outline">{result.tokensUsed} tokens</Badge>
                )}
              </CardTitle>
              {cap.applyable && canApply && proposedItems.length > 0 && (
                <Button
                  size="sm"
                  onClick={apply}
                  disabled={selected.size === 0 || applying}
                  variant={selected.size > 0 ? "default" : "outline"}
                >
                  {applying ? <Loader2 className="animate-spin" /> : <CheckSquare />}
                  Apply selected ({selected.size})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeof output.summary === "string" && (
              <div>
                <p className="text-sm text-foreground">{output.summary}</p>
                {Array.isArray(output.highlights) && (
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {(output.highlights as string[]).map((h, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-success">•</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
                {Array.isArray(output.risks) && (output.risks as string[]).length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-warning">Risks</p>
                    <ul className="mt-1 space-y-1 text-sm text-muted">
                      {(output.risks as string[]).map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-warning">!</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {typeof output.explanation === "string" && (
              <div>
                <p className="text-sm text-foreground">{output.explanation}</p>
                {Array.isArray(output.recommendations) && (
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {(output.recommendations as string[]).map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary">→</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {Array.isArray((output as { picks?: unknown }).picks) && (
              <div className="space-y-2">
                {((output as { picks: Array<{ issueKey: string; rationale: string }> }).picks).map((p) => (
                  <div key={p.issueKey} className="rounded-md border border-border-subtle p-2.5 text-sm">
                    <span className="font-mono text-xs text-primary">{p.issueKey}</span>
                    <p className="mt-1 text-muted">{p.rationale}</p>
                  </div>
                ))}
                {typeof (output as { notes?: string }).notes === "string" && (
                  <p className="text-xs text-faint">{(output as { notes: string }).notes}</p>
                )}
              </div>
            )}

            {typeof (output as { pick?: { issueKey: string; rationale: string } }).pick === "object" &&
              (output as { pick?: { issueKey: string; rationale: string } }).pick && (
                <div className="rounded-md border border-primary/40 bg-primary-soft/30 p-3 text-sm">
                  <p className="font-medium">
                    Next task:{" "}
                    <span className="font-mono text-primary">
                      {(output as { pick: { issueKey: string } }).pick.issueKey}
                    </span>
                  </p>
                  <p className="mt-1 text-muted">
                    {(output as { pick: { rationale: string } }).pick.rationale}
                  </p>
                </div>
              )}

            {/* Confirmation-gated proposals */}
            {proposedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-faint">
                  Select the items you want to create/update, then confirm. Nothing changes without
                  your explicit selection.
                </p>
                {proposedItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => cap.applyable && canApply && toggleSelect(idx)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
                      selected.has(idx)
                        ? "border-primary bg-primary-soft/40"
                        : "border-border-subtle hover:bg-surface-2",
                      !cap.applyable || !canApply ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    {cap.applyable && canApply ? (
                      selected.has(idx) ? (
                        <CheckSquare className="mt-0.5 h-4 w-4 text-primary" />
                      ) : (
                        <Square className="mt-0.5 h-4 w-4 text-muted" />
                      )
                    ) : (
                      <span className="mt-0.5 text-xs text-faint">#{idx + 1}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {String(item.title ?? item.issueKey ?? "Proposal")}
                      </p>
                      {typeof item.description === "string" && item.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{String(item.description)}</p>
                      ) : null}
                      {typeof item.rationale === "string" && item.rationale ? (
                        <p className="mt-0.5 text-xs text-muted">{String(item.rationale)}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {typeof item.type === "string" ? (
                          <Badge variant="secondary">{item.type}</Badge>
                        ) : null}
                        {typeof item.priority === "string" ? (
                          <Badge variant="outline">{item.priority}</Badge>
                        ) : null}
                        {typeof item.storyPoints === "number" ? (
                          <Badge variant="outline">{item.storyPoints} pts</Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-faint">
        <Settings2 className="h-3.5 w-3.5" />
        AI output is validated against a strict schema. Issue data sent to the model is treated as
        untrusted content and cannot override TaskFlow policies.
      </p>
    </div>
  );
}
