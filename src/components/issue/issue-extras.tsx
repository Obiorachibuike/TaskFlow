"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  Send,
  Trash2,
  Paperclip,
  Link2,
  CircleDot,
  AlertCircle,
  Bug,
  BookOpen,
  SquareCheck,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/rich-text";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn, formatDate, isOverdue, timeAgo, formatBytes } from "@/lib/utils";

type IconComp = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
export const TYPE_META: Record<string, { icon: IconComp; color: string; label: string }> = {
  EPIC: { icon: Layers, color: "#8B5CF6", label: "Epic" },
  STORY: { icon: BookOpen, color: "#22C55E", label: "Story" },
  TASK: { icon: SquareCheck, color: "#6366F1", label: "Task" },
  BUG: { icon: Bug, color: "#EF4444", label: "Bug" },
  SUBTASK: { icon: CircleDot, color: "#F59E0B", label: "Subtask" },
};

export const PRIORITY_META: Record<string, { color: string; label: string; variant: "danger" | "warning" | "secondary" | "outline" }> = {
  URGENT: { color: "#EF4444", label: "Urgent", variant: "danger" },
  HIGH: { color: "#F59E0B", label: "High", variant: "warning" },
  MEDIUM: { color: "#6366F1", label: "Medium", variant: "secondary" },
  LOW: { color: "#94A3B8", label: "Low", variant: "outline" },
};

export const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#64748B",
  TODO: "#94A3B8",
  IN_PROGRESS: "#6366F1",
  IN_REVIEW: "#8B5CF6",
  DONE: "#22C55E",
};

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const meta = TYPE_META[type] ?? TYPE_META.TASK!;
  const Icon = meta.icon;
  return <Icon className={cn("h-3.5 w-3.5", className)} style={{ color: meta.color }} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.MEDIUM!;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export interface IssueLike {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  statusCategory: string;
  priority: string;
  storyPoints: number | null;
  dueDate: string | Date | null;
  startDate?: string | Date | null;
  sprintId?: string | null;
  projectId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  project?: { key: string; name: string; color: string; icon: string | null; workspace: { slug: string } };
  assignees: Array<{ user: { id: string; name: string; image: string | null; avatarColor: string | null } }>;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
  _count?: { comments: number; subtasks: number; attachments: number };
}

export function IssueCard({
  issue,
  workspaceSlug,
  onOpen,
  className,
}: {
  issue: IssueLike;
  workspaceSlug: string;
  onOpen?: (issueId: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const overdue = isOverdue(issue.dueDate, issue.statusCategory === "DONE");
  return (
    <button
      onClick={() => {
        if (onOpen) onOpen(issue.id);
        else
          router.push(
            `/app/${workspaceSlug}/projects/${issue.project?.key ?? ""}/issues/${issue.key}`,
          );
      }}
      className={cn(
        "w-full rounded-lg border border-border-subtle bg-surface p-2.5 text-left shadow-sm transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <TypeIcon type={issue.type} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-faint">{issue.key}</span>
            {issue.storyPoints != null && (
              <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{issue.storyPoints}pt</span>
            )}
            {overdue && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-danger">
                <AlertCircle className="h-3 w-3" /> overdue
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{issue.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={issue.priority} />
            {issue.labels.slice(0, 2).map((l) => (
              <span
                key={l.label.id}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${l.label.color}22`, color: l.label.color }}
              >
                {l.label.name}
              </span>
            ))}
            {issue.labels.length > 2 && (
              <span className="text-[10px] text-faint">+{issue.labels.length - 2}</span>
            )}
            <span className="flex-1" />
            {issue.dueDate && (
              <span className={cn("text-[10px]", overdue ? "text-danger" : "text-faint")}>
                {formatDate(issue.dueDate)}
              </span>
            )}
            <div className="flex -space-x-1.5">
              {issue.assignees.slice(0, 3).map((a) => (
                <UserAvatar key={a.user.id} user={a.user} size="xs" className="ring-2 ring-surface" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null; avatarColor: string | null };
  replies?: CommentItem[];
}

export function CommentThread({
  issueId,
  comments,
  onRefresh,
  canComment,
}: {
  issueId: string;
  comments: CommentItem[];
  onRefresh: () => void;
  canComment: boolean;
}) {
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyBody, setReplyBody] = React.useState("");
  const { toast } = useToast();

  async function submit(parentId?: string | null) {
    const text = parentId ? replyBody : body;
    if (!text.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/api/issues/${issueId}/comments`, {
        method: "POST",
        json: { body: text, parentId: parentId ?? null },
      });
      if (parentId) {
        setReplyBody("");
        setReplyTo(null);
      } else {
        setBody("");
      }
      onRefresh();
    } catch (err) {
      toast({ variant: "error", title: "Comment failed", description: errorMessage(err) });
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/comments/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      toast({ variant: "error", title: "Delete failed", description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-4">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-border-subtle bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <UserAvatar user={c.author} size="sm" />
            <div className="flex-1">
              <p className="text-sm font-medium">{c.author.name}</p>
              <p className="text-[11px] text-faint">{timeAgo(c.createdAt)}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => remove(c.id)} aria-label="Delete comment">
              <Trash2 />
            </Button>
          </div>
          <div className="mt-2">
            <RichText text={c.body} />
          </div>
          {(c.replies ?? []).length > 0 && (
            <div className="mt-3 space-y-3 border-l-2 border-border-subtle pl-3">
              {(c.replies ?? []).map((r) => (
                <div key={r.id}>
                  <div className="flex items-center gap-2">
                    <UserAvatar user={r.author} size="xs" />
                    <p className="text-xs font-medium">{r.author.name}</p>
                    <p className="text-[10px] text-faint">{timeAgo(r.createdAt)}</p>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(r.id)} aria-label="Delete reply">
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-1">
                    <RichText text={r.body} className="text-xs" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {canComment && (
            <div className="mt-2">
              {replyTo === c.id ? (
                <div className="flex gap-2">
                  <Textarea
                    rows={2}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="icon-sm" onClick={() => submit(c.id)} disabled={sending}>
                      {sending ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setReplyTo(null)}>
                      <X />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setReplyTo(c.id)}>
                  Reply
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      {canComment ? (
        <div className="flex gap-2">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment… (supports **bold**, `code`, lists, @mentions)"
          />
          <Button onClick={() => submit(null)} disabled={sending || !body.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-faint">Viewers cannot comment.</p>
      )}
    </div>
  );
}

export function AttachmentList({
  issueId,
  canUpload,
  onRefresh,
}: {
  issueId: string;
  canUpload: boolean;
  onRefresh: () => void;
}) {
  const [items, setItems] = React.useState<
    Array<{ id: string; fileName: string; sizeBytes: number; mimeType: string; createdAt: string; uploader: { name: string } }>
  >([]);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ attachments: typeof items }>(
        `/api/issues/${issueId}/attachments`,
      );
      setItems(data.attachments);
    } catch {
      /* ignore */
    }
  }, [issueId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiFetch(`/api/issues/${issueId}/attachments`, { method: "POST", body: form });
      toast({ variant: "success", title: "File uploaded" });
      await load();
      onRefresh();
    } catch (err) {
      toast({ variant: "error", title: "Upload failed", description: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/attachments/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast({ variant: "error", title: "Delete failed", description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface-2/40 px-3 py-2"
        >
          <Paperclip className="h-4 w-4 text-muted" />
          <a
            href={`/api/attachments/${a.id}`}
            className="flex-1 truncate text-sm text-primary hover:underline"
          >
            {a.fileName}
          </a>
          <span className="text-[11px] text-faint">{formatBytes(a.sizeBytes)}</span>
          {canUpload && (
            <Button variant="ghost" size="icon-sm" onClick={() => remove(a.id)} aria-label="Delete attachment">
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            Attach file
          </Button>
        </>
      )}
    </div>
  );
}

export function DependencyList({
  issueId,
  dependencies,
  blockers,
  canEdit,
  onRefresh,
}: {
  issueId: string;
  dependencies: Array<{ id: string; blocker: { id: string; key: string; title: string; status: string } }>;
  blockers: Array<{ id: string; issue: { id: string; key: string; title: string; status: string } }>;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const { toast } = useToast();

  async function removeDep(depId: string) {
    try {
      await apiFetch(`/api/issues/${issueId}/dependencies/${depId}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      toast({ variant: "error", title: "Failed", description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-2">
      {dependencies.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-1.5 text-sm">
          <Link2 className="h-3.5 w-3.5 text-warning" />
          <span className="text-muted">blocked by</span>
          <span className="font-mono text-xs text-primary">{d.blocker.key}</span>
          <span className="flex-1 truncate">{d.blocker.title}</span>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" onClick={() => removeDep(d.id)} aria-label="Remove dependency">
              <X />
            </Button>
          )}
        </div>
      ))}
      {blockers.map((b) => (
        <div key={b.id} className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-1.5 text-sm">
          <Link2 className="h-3.5 w-3.5 text-success" />
          <span className="text-muted">blocks</span>
          <span className="font-mono text-xs text-primary">{b.issue.key}</span>
          <span className="flex-1 truncate">{b.issue.title}</span>
        </div>
      ))}
      {dependencies.length === 0 && blockers.length === 0 && (
        <p className="text-xs text-faint">No dependencies recorded.</p>
      )}
    </div>
  );
}

export function CopyLinkButton({ label }: { label?: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href);
        toast({ variant: "success", title: "Link copied" });
      }}
    >
      <Link2 />
      {label ?? "Copy link"}
    </Button>
  );
}
