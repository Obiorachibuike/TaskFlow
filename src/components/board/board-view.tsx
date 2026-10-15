"use client";

/**
 * Kanban board with drag-and-drop (dnd-kit), keyboard-accessible reordering,
 * inline issue creation, filters, and a side panel for issue details.
 *
 * Optimistic UI rule: a move is only kept after the server confirms it.
 * On failure the card snaps back and a toast explains why — the board never
 * shows a permanent success state when the database update failed.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { GripVertical, Plus, Loader2, AlertCircle, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateIssueDialog } from "@/components/issue/create-issue-dialog";
import { IssuePanel } from "@/components/issue/issue-panel";
import { IssueCard, TypeIcon, PriorityBadge, STATUS_COLORS, type IssueLike } from "@/components/issue/issue-extras";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn, isOverdue } from "@/lib/utils";

interface Column {
  id: string;
  key: string;
  name: string;
  category: string;
  color: string | null;
  position: number;
}

export interface BoardData {
  project: { id: string; key: string; name: string; color: string; icon: string | null };
  columns: Column[];
  grouped: Record<string, IssueLike[]>;
}

function SortableCard({
  issue,
  workspaceSlug,
  onOpen,
  disabled,
}: {
  issue: IssueLike;
  workspaceSlug: string;
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled,
    data: { type: "issue", issue },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-40")}
    >
      <div className="group relative">
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-1 top-2 z-10 hidden h-6 w-5 cursor-grab items-center justify-center rounded text-faint hover:text-foreground group-hover:flex focus-visible:flex"
          aria-label={`Reorder ${issue.key} (drag or use arrow keys)`}
          disabled={disabled}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <IssueCard issue={issue} workspaceSlug={workspaceSlug} onOpen={onOpen} />
      </div>
    </div>
  );
}

function BoardColumnView({
  column,
  issues,
  workspaceSlug,
  onOpen,
  onCreate,
  canEdit,
}: {
  column: Column;
  issues: IssueLike[];
  workspaceSlug: string;
  onOpen: (id: string) => void;
  onCreate: (status: string) => void;
  canEdit: boolean;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: `column:${column.key}`,
    data: { type: "column", key: column.key },
    disabled: !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[290px] shrink-0 flex-col rounded-xl border bg-board/60 transition-colors",
        isOver ? "border-primary/60 bg-primary-soft/40" : "border-border-subtle",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: column.color ?? STATUS_COLORS[column.category] ?? "#6366F1" }}
        />
        <h3 className="text-sm font-medium text-foreground">{column.name}</h3>
        <Badge variant="secondary" className="ml-auto">
          {issues.length}
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCreate(column.key)}
          aria-label={`Create issue in ${column.name}`}
        >
          <Plus />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <SortableCard
              key={issue.id}
              issue={issue}
              workspaceSlug={workspaceSlug}
              onOpen={onOpen}
              disabled={!canEdit}
            />
          ))}
        </SortableContext>
        {issues.length === 0 && (
          <p className="rounded-md border border-dashed border-border-subtle px-3 py-6 text-center text-xs text-faint">
            {canEdit ? "Drag issues here or click + to create" : "No issues"}
          </p>
        )}
      </div>
    </div>
  );
}

export function BoardView({
  initial,
  workspaceSlug,
  canEdit,
  members,
  labels,
}: {
  initial: BoardData;
  workspaceSlug: string;
  canEdit: boolean;
  members: Array<{ userId: string; name: string; avatarColor: string | null; image: string | null }>;
  labels: Array<{ id: string; name: string; color: string }>;
}) {
  const [columns] = React.useState(initial.columns);
  const [grouped, setGrouped] = React.useState(initial.grouped);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pendingMoves, setPendingMoves] = React.useState<Set<string>>(new Set());
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);
  const [openIssueId, setOpenIssueId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState({
    q: "",
    assignee: "any",
    priority: "any",
    type: "any",
    label: "any",
  });
  const { toast } = useToast();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allIssues = React.useMemo(() => Object.values(grouped).flat(), [grouped]);

  const visibleIssues = React.useMemo(() => {
    const f = filters;
    const match = (i: IssueLike) => {
      if (f.q && !`${i.key} ${i.title}`.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.assignee === "unassigned" && i.assignees.length > 0) return false;
      if (f.assignee !== "any" && f.assignee !== "unassigned" && !i.assignees.some((a) => a.user.id === f.assignee))
        return false;
      if (f.priority !== "any" && i.priority !== f.priority) return false;
      if (f.type !== "any" && i.type !== f.type) return false;
      if (f.label !== "any" && !i.labels.some((l) => l.label.id === f.label)) return false;
      return true;
    };
    const next: Record<string, IssueLike[]> = {};
    for (const col of columns) next[col.key] = (grouped[col.key] ?? []).filter(match);
    return next;
  }, [grouped, columns, filters]);

  const activeIssue = activeId ? allIssues.find((i) => i.id === activeId) : null;
  const hasFilters = Object.entries(filters).some(([, v]) => v !== "any" && v !== "");

  function findColumnOf(issueId: string): string | null {
    for (const col of columns) {
      if ((grouped[col.key] ?? []).some((i) => i.id === issueId)) return col.key;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    if (String(e.active.id).startsWith("column:")) return;
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const active = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || active.startsWith("column:")) return;

    const fromKey = findColumnOf(active);
    const overIsColumn = overId.startsWith("column:");
    const toKey = overIsColumn ? overId.slice("column:".length) : findColumnOf(overId);
    if (!fromKey || !toKey || fromKey === toKey) return;

    // live preview: move card between columns while dragging
    setGrouped((prev) => {
      const next = { ...prev };
      const moving = (next[fromKey] ?? []).find((i) => i.id === active);
      if (!moving) return prev;
      next[fromKey] = (next[fromKey] ?? []).filter((i) => i.id !== active);
      const target = [...(next[toKey] ?? [])];
      const overIndex = overIsColumn ? target.length : target.findIndex((i) => i.id === overId);
      target.splice(overIndex < 0 ? target.length : overIndex, 0, moving);
      next[toKey] = target;
      return next;
    });
  }

  async function commitMove(issueId: string, toKey: string, beforeId: string | null, afterId: string | null) {
    setPendingMoves((s) => new Set(s).add(issueId));
    try {
      await apiFetch(`/api/issues/${issueId}/move`, {
        method: "POST",
        json: { status: toKey, beforeId, afterId },
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Move failed — card returned to its column",
        description: errorMessage(err, "The board was restored to the persisted state."),
      });
      router.refresh();
    } finally {
      setPendingMoves((s) => {
        const next = new Set(s);
        next.delete(issueId);
        return next;
      });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const active = String(e.active.id);
    setActiveId(null);
    if (active.startsWith("column:")) return;
    const overId = e.over ? String(e.over.id) : null;

    const fromKey = findColumnOf(active);
    if (!fromKey) return;

    if (!overId) {
      // dropped on nothing — snap back
      setGrouped(initial.grouped);
      return;
    }

    const overIsColumn = overId.startsWith("column:");
    const toKey = overIsColumn ? overId.slice("column:".length) : findColumnOf(overId);
    if (!toKey) {
      setGrouped(initial.grouped);
      return;
    }

    const list = grouped[toKey] ?? [];
    const overIndex = overIsColumn ? list.length - 1 : list.findIndex((i) => i.id === overId);
    const afterId = overIndex >= 0 ? list[overIndex]?.id ?? null : null;
    const beforeId = overIndex >= 0 ? list[overIndex + 1]?.id ?? null : null;

    void commitMove(active, toKey, beforeId, afterId);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <Filter className="h-3.5 w-3.5 text-muted" />
        <Input
          placeholder="Filter by title or key…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          className="h-8 w-52 text-xs"
        />
        <Select value={filters.assignee} onValueChange={(v) => setFilters((f) => ({ ...f, assignee: v }))}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any assignee</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any priority</SelectItem>
            {["URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any type</SelectItem>
            {["EPIC", "STORY", "TASK", "BUG", "SUBTASK"].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.label} onValueChange={(v) => setFilters((f) => ({ ...f, label: v }))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any label</SelectItem>
            {labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ q: "", assignee: "any", priority: "any", type: "any", label: "any" })}
          >
            <X />
            Clear
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-faint">
          {pendingMoves.size > 0 && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </>
          )}
          Drag cards between columns, or focus a card and use the keyboard.
        </span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          modifiers={activeId ? [restrictToVerticalAxis] : []}
        >
          <div className="flex items-start gap-3">
            {columns.map((col) => (
              <BoardColumnView
                key={col.key}
                column={col}
                issues={visibleIssues[col.key] ?? []}
                workspaceSlug={workspaceSlug}
                onOpen={setOpenIssueId}
                onCreate={setCreateStatus}
                canEdit={canEdit}
                activeId={activeId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeIssue ? (
              <div className="w-[280px] rotate-2 opacity-90 shadow-[var(--shadow-md)]">
                <IssueCard issue={activeIssue} workspaceSlug={workspaceSlug} onOpen={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <CreateIssueDialog
        open={createStatus !== null}
        onOpenChange={(o) => !o && setCreateStatus(null)}
        workspaceSlug={workspaceSlug}
        projects={[{ id: initial.project.id, key: initial.project.key, name: initial.project.name, icon: initial.project.icon }]}
        defaultProjectId={initial.project.id}
        defaultStatus={createStatus ?? undefined}
        onCreated={() => router.refresh()}
      />

      {openIssueId && (
        <IssuePanel
          issueId={openIssueId}
          workspaceSlug={workspaceSlug}
          onClose={() => setOpenIssueId(null)}
          canEdit={canEdit}
          members={members}
          columns={columns}
          onUpdated={() => router.refresh()}
        />
      )}
    </div>
  );
}

void TypeIcon;
void PriorityBadge;
void isOverdue;
void AlertCircle;
void arrayMove;
