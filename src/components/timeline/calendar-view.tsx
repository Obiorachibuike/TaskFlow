"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, isOverdue } from "@/lib/utils";

export interface CalendarIssue {
  id: string;
  key: string;
  title: string;
  status: string;
  statusCategory: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  project: { key: string; name: string; color: string; workspace: { slug: string } };
  assignees: Array<{ user: { name: string; avatarColor: string | null } }>;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  issues,
  workspaceSlug,
  filters,
  onFilters,
  projects,
}: {
  issues: CalendarIssue[];
  workspaceSlug: string;
  filters: { project: string; assignee: string };
  onFilters: (f: { project: string; assignee: string }) => void;
  projects: Array<{ key: string; name: string }>;
}) {
  const [month, setMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const days = React.useMemo(() => {
    const first = new Date(month);
    const startDow = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(first);
    start.setDate(first.getDate() - startDow);
    const list: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d);
    }
    return list;
  }, [month]);

  const filtered = issues.filter((i) => {
    if (filters.project !== "all" && i.project.key !== filters.project) return false;
    return true;
  });

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarIssue[]>();
    for (const issue of filtered) {
      for (const field of [issue.dueDate, issue.startDate]) {
        if (!field) continue;
        const day = isoDay(new Date(field));
        const arr = map.get(day) ?? [];
        if (!arr.some((x) => x.id === issue.id)) arr.push(issue);
        map.set(day, arr);
      }
    }
    return map;
  }, [filtered]);

  const today = isoDay(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <h2 className="w-40 text-center text-sm font-medium">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>
          Today
        </Button>

        <span className="flex-1" />

        <select
          className="h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs"
          value={filters.project}
          onChange={(e) => onFilters({ ...filters, project: e.target.value })}
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-surface-2 px-2 py-1.5 text-center text-[11px] font-medium text-muted">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = isoDay(d);
          const inMonth = d.getMonth() === month.getMonth();
          const items = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={cn(
                "min-h-[110px] bg-surface p-1.5",
                !inMonth && "bg-surface/50 opacity-50",
                key === today && "ring-1 ring-inset ring-primary",
              )}
            >
              <div className="mb-1 text-right text-[11px] text-faint">{d.getDate()}</div>
              <div className="space-y-1">
                {items.slice(0, 3).map((issue) => {
                  const overdue = isOverdue(issue.dueDate, issue.statusCategory === "DONE");
                  return (
                    <a
                      key={issue.id}
                      href={`/app/${workspaceSlug}/projects/${issue.project.key}/issues/${issue.key}`}
                      className={cn(
                        "block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        overdue ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary hover:bg-primary/20",
                      )}
                      title={`${issue.key} — ${issue.title}`}
                    >
                      {issue.key} {issue.title}
                    </a>
                  );
                })}
                {items.length > 3 && (
                  <p className="px-1 text-[10px] text-faint">+{items.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" /> Overdue / due date
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary/60" /> Scheduled work
        </span>
        <Badge variant="secondary">{filtered.length} issues with dates</Badge>
      </div>
    </div>
  );
}
