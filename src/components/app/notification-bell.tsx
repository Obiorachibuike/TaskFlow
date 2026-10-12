"use client";

import * as React from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";
import { timeAgo } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { name: string; avatarColor: string | null } | null;
}

export function NotificationBell({
  workspaceSlug,
  initialUnread = 0,
}: {
  workspaceSlug: string;
  initialUnread?: number;
}) {
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ notifications: NotificationItem[]; unread: number }>(
        `/api/notifications?workspace=${workspaceSlug}`,
      );
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (open && items === null) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markAll() {
    try {
      await apiFetch("/api/notifications", {
        method: "POST",
        json: { action: "markAllRead", workspace: workspaceSlug },
      });
      setUnread(0);
      setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    } catch {
      /* handled */
    }
  }

  async function openOne(n: NotificationItem) {
    if (!n.readAt) {
      void apiFetch(`/api/notifications/${n.id}`, { method: "POST" });
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
    }
    if (n.link) {
      window.location.href = n.link;
    }
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0}>
            <CheckCheck />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          )}
          {!loading && items?.length === 0 && (
            <p className="py-8 text-center text-sm text-faint">You&apos;re all caught up.</p>
          )}
          {!loading &&
            items?.map((n) => (
              <button
                key={n.id}
                onClick={() => openOne(n)}
                className={`flex w-full items-start gap-2.5 border-b border-border-subtle/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-surface-2 ${
                  n.readAt ? "opacity-70" : ""
                }`}
              >
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" style={{ opacity: n.readAt ? 0 : 1 }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{n.title}</p>
                  {n.body && <p className="mt-0.5 truncate text-xs text-muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-faint">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
