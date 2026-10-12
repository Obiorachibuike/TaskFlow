"use client";

import * as React from "react";
import { AlertTriangle, Link2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, isOverdue } from "@/lib/utils";

interface TimelineItem {
  id: string;
  key: string;
  title: string;
  type: string;
  statusCategory: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  project: string;
  projectKey: string;
  projectColor: string;
  assignees: string[];
  blockedBy: string[];
}

const DAY_W = 28;

export function TimelineGantt({
  items,
  workspaceSlug,
  projects,
}: {
  items: TimelineItem[];
  workspaceSlug: string;
  projects: Array<{ key: string; name: string; color: string }>;
}) {
  const [projectFilter, setProjectFilter] = React.useState("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState("all");

  const filtered = items.filter((i) => {
    if (projectFilter !== "all" && i.projectKey !== projectFilter) return false;
    if (assigneeFilter !== "all" && !i.assignees.includes(assigneeFilter)) return false;
    return true;
  });

  const assignees = [...new Set(items.flatMap((i) => i.assignees))];

  const dated = filtered.filter((i) => i.startDate || i.dueDate);
  const minDate = new Date(
    Math.min(...dated.map((i) => new Date(i.startDate ?? i.dueDate!).getTime()), Date.now() - 7 * 86400000),
  );
  const maxDate = new Date(
    Math.max(...dated.map((i) => new Date(i.dueDate ?? i.startDate!).getTime()), Date.now() + 14 * 86400000),
  );
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000));

  function posOf(d: string | null): number {
    if (!d) return 0;
    return Math.max(
      0,
      Math.round((new Date(d).getTime() - minDate.getTime()) / 86400000) * DAY_W,
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <select
          className="h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="all">All assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Badge variant="secondary">{filtered.length} items</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <div className="min-w-max">
          {/* header */}
          <div className="flex border-b border-border-subtle bg-surface-2">
            <div className="sticky left-0 z-10 w-[320px] shrink-0 border-r border-border-subtle bg-surface-2 px-3 py-2 text-xs font-medium text-muted">
              Work item
            </div>
            <div className="relative flex-1 px-2 py-2" style={{ width: totalDays * DAY_W }}>
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-2 text-[10px] text-faint"
                  style={{ left: i * 7 * DAY_W + 4 }}
                >
                  {new Date(minDate.getTime() + i * 7 * 86400000).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              ))}
            </div>
          </div>

          {filtered.map((item) => {
            const start = item.startDate ?? item.dueDate;
            const end = item.dueDate ?? item.startDate;
            const left = posOf(start);
            const width = Math.max(DAY_W, posOf(end) - left + DAY_W);
            const overdue = isOverdue(item.dueDate, item.statusCategory === "DONE");
            return (
              <div key={item.id} className="flex border-b border-border-subtle last:border-0">
                <div className="sticky left-0 z-10 w-[320px] shrink-0 border-r border-border-subtle bg-surface px-3 py-2">
                  <a
                    href={`/app/${workspaceSlug}/projects/${item.projectKey}/issues/${item.key}`}
                    className="group block"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.projectColor }} />
                      <span className="font-mono text-[10px] text-primary">{item.key}</span>
                      <span className="truncate text-xs text-foreground group-hover:underline">{item.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-faint">
                      {item.type}
                      {item.assignees.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <User className="h-2.5 w-2.5" />
                          {item.assignees[0]}
                        </span>
                      )}
                      {item.blockedBy.length > 0 && (
                        <span className="flex items-center gap-0.5 text-warning">
                          <Link2 className="h-2.5 w-2.5" />
                          blocked: {item.blockedBy.join(", ")}
                        </span>
                      )}
                    </div>
                  </a>
                </div>
                <div className="relative py-2" style={{ width: totalDays * DAY_W }}>
                  {/* week gridlines */}
                  {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 border-l border-border-subtle/60"
                      style={{ left: i * 7 * DAY_W }}
                    />
                  ))}
                  <a
                    href={`/app/${workspaceSlug}/projects/${item.projectKey}/issues/${item.key}`}
                    className={cn(
                      "absolute flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-white shadow-sm transition-opacity hover:opacity-85",
                      item.statusCategory === "DONE" && "opacity-70",
                      overdue && "ring-1 ring-danger",
                    )}
                    style={{
                      left,
                      width,
                      background: overdue ? "#DC2626" : item.projectColor,
                    }}
                    title={`${item.key} — ${item.title}`}
                  >
                    {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
                    <span className="truncate">{item.key}</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
