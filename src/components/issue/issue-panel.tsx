"use client";

/**
 * Side panel with full issue details: editable fields (role-aware), comments,
 * attachments, dependencies, and duplicate/delete actions.
 */
import * as React from "react";
import { X, Loader2, Copy, Trash2, ExternalLink, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";
import { UserAvatar } from "@/components/ui/avatar";
import {
  CommentThread,
  AttachmentList,
  DependencyList,
  TypeIcon,
  PriorityBadge,
  CopyLinkButton,
} from "@/components/issue/issue-extras";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDate, cn, toDateInput } from "@/lib/utils";

interface IssueDetail {
  issue: {
    id: string;
    key: string;
    title: string;
    description: string;
    type: string;
    status: string;
    statusCategory: string;
    priority: string;
    storyPoints: number | null;
    startDate: string | null;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
    project: { key: string; name: string; color: string; icon: string | null; workspace: { slug: string } };
    assignees: Array<{ user: { id: string; name: string; image: string | null; avatarColor: string | null } }>;
    labels: Array<{ label: { id: string; name: string; color: string } }>;
    reporter: { id: string; name: string; image: string | null; avatarColor: string | null };
    parentIssue: { id: string; key: string; title: string; type: string } | null;
    subtasks: Array<{
      id: string;
      key: string;
      title: string;
      status: string;
      statusCategory: string;
      priority: string;
      type: string;
    }>;
    dependencies: Array<{ id: string; blocker: { id: string; key: string; title: string; status: string } }>;
    blockers: Array<{ id: string; issue: { id: string; key: string; title: string; status: string } }>;
    references: Array<{ id: string; kind: string; url: string; title: string | null; status: string | null }>;
  };
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; image: string | null; avatarColor: string | null };
    replies?: Array<{
      id: string;
      body: string;
      createdAt: string;
      author: { id: string; name: string; image: string | null; avatarColor: string | null };
    }>;
  }>;
  role: string;
}

export function IssuePanel({
  issueId,
  workspaceSlug,
  onClose,
  canEdit,
  members,
  columns,
  onUpdated,
  variant = "panel",
}: {
  issueId: string;
  workspaceSlug: string;
  onClose?: () => void;
  canEdit: boolean;
  members: Array<{ userId: string; name: string; avatarColor: string | null; image: string | null }>;
  columns: Array<{ key: string; name: string; category: string }>;
  onUpdated?: () => void;
  variant?: "panel" | "page";
}) {
  const isPage = variant === "page";
  const [data, setData] = React.useState<IssueDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editingDesc, setEditingDesc] = React.useState(false);
  const [savingField, setSavingField] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    try {
      const d = await apiFetch<IssueDetail>(`/api/issues/${issueId}?workspace=${workspaceSlug}`);
      setData(d);
      setTitle(d.issue.title);
      setDescription(d.issue.description);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to load issue"));
    } finally {
      setLoading(false);
    }
  }, [issueId, workspaceSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function patch(fields: Record<string, unknown>, fieldLabel: string) {
    setSavingField(fieldLabel);
    try {
      await apiFetch(`/api/issues/${issueId}`, { method: "PATCH", json: fields });
      await load();
      onUpdated?.();
    } catch (err) {
      toast({ variant: "error", title: "Update failed", description: errorMessage(err) });
      await load();
    } finally {
      setSavingField(null);
    }
  }

  async function duplicate() {
    try {
      const copy = await apiFetch<{ key: string }>(`/api/issues/${issueId}/duplicate`, {
        method: "POST",
        json: {},
      });
      toast({ variant: "success", title: `Duplicated as ${copy.key}` });
      onUpdated?.();
    } catch (err) {
      toast({ variant: "error", title: "Duplicate failed", description: errorMessage(err) });
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/issues/${issueId}`, { method: "DELETE" });
      toast({ variant: "success", title: "Issue deleted" });
      onUpdated?.();
      onClose?.();
    } catch (err) {
      toast({ variant: "error", title: "Delete failed", description: errorMessage(err) });
    }
  }

  React.useEffect(() => {
    if (isPage) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isPage]);

  const shellClass = isPage
    ? "flex w-full flex-col"
    : "fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-border-subtle bg-surface shadow-[var(--shadow-md)] animate-slide-up";

  return (
    <>
      {!isPage && <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden />}
      <aside className={shellClass} role={isPage ? undefined : "dialog"} aria-label="Issue details">
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>
              Try again
            </Button>
          </div>
        )}
        {data && !loading && (
          <>
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
              <TypeIcon type={data.issue.type} />
              <span className="font-mono text-sm text-primary">{data.issue.key}</span>
              {data.issue.parentIssue && (
                <Badge variant="secondary">↳ {data.issue.parentIssue.key}</Badge>
              )}
              <span className="flex-1" />
              <CopyLinkButton />
              <Button variant="outline" size="sm" onClick={duplicate} disabled={!canEdit}>
                <Copy />
                Duplicate
              </Button>
              {!isPage && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/app/${workspaceSlug}/projects/${data.issue.project.key}/issues/${data.issue.key}`}
                    onClick={onClose}
                  >
                    <ExternalLink />
                    Open
                  </a>
                </Button>
              )}
              {!isPage && (
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
                  <X />
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-5 p-4">
                {/* Title */}
                {editingTitle ? (
                  <div className="flex gap-2">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-base font-medium"
                      autoFocus
                    />
                    <Button
                      size="icon-sm"
                      onClick={() => {
                        setEditingTitle(false);
                        if (title.trim() && title !== data.issue.title) void patch({ title: title.trim() }, "title");
                      }}
                    >
                      <Check />
                    </Button>
                  </div>
                ) : (
                  <h2
                    className={cn(
                      "group flex items-start gap-2 text-lg font-semibold leading-snug",
                      canEdit && "cursor-text",
                    )}
                    onClick={() => canEdit && setEditingTitle(true)}
                  >
                    {data.issue.title}
                    {canEdit && (
                      <Pencil className="mt-1 h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </h2>
                )}

                {/* Status / priority / type row */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Status">
                    <Select
                      value={data.issue.status}
                      disabled={!canEdit || savingField === "status"}
                      onValueChange={(v) => void patch({ status: v }, "status")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={data.issue.priority}
                      disabled={!canEdit || savingField === "priority"}
                      onValueChange={(v) => void patch({ priority: v }, "priority")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Type">
                    <Select
                      value={data.issue.type}
                      disabled={!canEdit || savingField === "type"}
                      onValueChange={(v) => void patch({ type: v }, "type")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["EPIC", "STORY", "TASK", "BUG", "SUBTASK"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Story points">
                    <Input
                      type="number"
                      min={0}
                      defaultValue={data.issue.storyPoints ?? ""}
                      className="h-8 text-xs"
                      disabled={!canEdit}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== data.issue.storyPoints) void patch({ storyPoints: v }, "points");
                      }}
                    />
                  </Field>
                </div>

                {/* Assignees */}
                <Field label="Assignees">
                  <div className="flex flex-wrap items-center gap-2">
                    {data.issue.assignees.map((a) => (
                      <div
                        key={a.user.id}
                        className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 py-0.5 pl-0.5 pr-2"
                      >
                        <UserAvatar user={a.user} size="xs" />
                        <span className="text-xs">{a.user.name}</span>
                        {canEdit && (
                          <button
                            onClick={() =>
                              void patch(
                                {
                                  assigneeIds: data.issue.assignees
                                    .map((x) => x.user.id)
                                    .filter((id) => id !== a.user.id),
                                },
                                "assignees",
                              )
                            }
                            className="text-faint hover:text-danger"
                            aria-label={`Remove ${a.user.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <Select
                        onValueChange={(v) => {
                          const ids = data.issue.assignees.map((x) => x.user.id);
                          if (!ids.includes(v)) void patch({ assigneeIds: [...ids, v] }, "assignees");
                        }}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue placeholder="+ Assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {members
                            .filter((m) => !data.issue.assignees.some((a) => a.user.id === m.userId))
                            .map((m) => (
                              <SelectItem key={m.userId} value={m.userId}>
                                {m.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </Field>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date">
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      defaultValue={toDateInput(data.issue.startDate)}
                      disabled={!canEdit}
                      onBlur={(e) => {
                        const v = e.target.value ? `${e.target.value}T00:00:00.000Z` : null;
                        if (toDateInput(data.issue.startDate) !== e.target.value)
                          void patch({ startDate: v }, "startDate");
                      }}
                    />
                  </Field>
                  <Field label="Due date">
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      defaultValue={toDateInput(data.issue.dueDate)}
                      disabled={!canEdit}
                      onBlur={(e) => {
                        const v = e.target.value ? `${e.target.value}T00:00:00.000Z` : null;
                        if (toDateInput(data.issue.dueDate) !== e.target.value)
                          void patch({ dueDate: v }, "dueDate");
                      }}
                    />
                  </Field>
                </div>

                {/* Labels */}
                {data.issue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.issue.labels.map((l) => (
                      <span
                        key={l.label.id}
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: `${l.label.color}22`, color: l.label.color }}
                      >
                        {l.label.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label className="text-xs text-muted">Description</Label>
                    {canEdit && !editingDesc && (
                      <Button variant="ghost" size="sm" onClick={() => setEditingDesc(true)}>
                        <Pencil />
                        Edit
                      </Button>
                    )}
                  </div>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={8}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Markdown-lite: **bold**, `code`, lists, # headings…"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingDesc(false);
                            if (description !== data.issue.description)
                              void patch({ description }, "description");
                          }}
                        >
                          <Check />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : data.issue.description ? (
                    <RichText text={data.issue.description} />
                  ) : (
                    <p className="text-sm text-faint">No description yet.</p>
                  )}
                </div>

                {/* Subtasks */}
                {data.issue.subtasks.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted">Subtasks</Label>
                    <div className="mt-1.5 space-y-1">
                      {data.issue.subtasks.map((s) => (
                        <a
                          key={s.id}
                          href={`/app/${workspaceSlug}/projects/${data.issue.project.key}/issues/${s.key}`}
                          className="flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 text-sm hover:bg-surface-2"
                        >
                          <TypeIcon type={s.type} />
                          <span className="font-mono text-xs text-primary">{s.key}</span>
                          <span className="flex-1 truncate">{s.title}</span>
                          <Badge variant={s.statusCategory === "DONE" ? "success" : "secondary"}>
                            {s.status.replace(/_/g, " ")}
                          </Badge>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependencies */}
                <div>
                  <Label className="text-xs text-muted">Dependencies</Label>
                  <div className="mt-1.5">
                    <DependencyList
                      issueId={data.issue.id}
                      dependencies={data.issue.dependencies}
                      blockers={data.issue.blockers}
                      canEdit={canEdit}
                      onRefresh={() => void load()}
                    />
                  </div>
                </div>

                {/* GitHub references */}
                {data.issue.references.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted">Development</Label>
                    <div className="mt-1.5 space-y-1">
                      {data.issue.references.map((r) => (
                        <a
                          key={r.id}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 text-sm hover:bg-surface-2"
                        >
                          <Badge variant="outline">{r.kind.replace("_", " ").toLowerCase()}</Badge>
                          <span className="flex-1 truncate">{r.title ?? r.url}</span>
                          {r.status && <Badge variant="secondary">{r.status}</Badge>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments */}
                <div>
                  <Label className="text-xs text-muted">Attachments</Label>
                  <div className="mt-1.5">
                    <AttachmentList
                      issueId={data.issue.id}
                      canUpload={canEdit}
                      onRefresh={() => void load()}
                    />
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <Label className="text-xs text-muted">
                    Activity & comments ({data.comments.length})
                  </Label>
                  <div className="mt-2">
                    <CommentThread
                      issueId={data.issue.id}
                      comments={data.comments}
                      onRefresh={() => void load()}
                      canComment={data.role !== "VIEWER"}
                    />
                  </div>
                </div>

                {/* Meta */}
                <div className="rounded-md border border-border-subtle bg-surface-2/40 p-3 text-xs text-faint">
                  <p>
                    Reported by {data.issue.reporter.name} · created {formatDate(data.issue.createdAt)} · updated{" "}
                    {formatDate(data.issue.updatedAt)}
                  </p>
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5">
                <PriorityBadge priority={data.issue.priority} />
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 />
                  Delete issue
                </Button>
              </div>
            )}
          </>
        )}
      </aside>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this issue?</DialogTitle>
            <DialogDescription>
              The issue and its subtasks will be hidden from views. This can be restored by an
              administrator from the database. Related comments and activity history are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              <Trash2 />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-faint">{label}</Label>
      {children}
    </div>
  );
}
