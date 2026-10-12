"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  FolderKanban,
  KanbanSquare,
  Layers,
  CalendarDays,
  GanttChartSquare,
  BarChart3,
  Bot,
  Plug,
  Settings,
  Zap,
} from "lucide-react";
import { WorkspaceSwitcher, NavItem } from "@/components/app/workspace-switcher";

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  role: string;
}

const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/my-tasks", label: "My Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/boards", label: "Boards", icon: KanbanSquare },
  { href: "/backlog", label: "Backlog", icon: Layers },
  { href: "/sprints", label: "Sprints", icon: Zap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/timeline", label: "Timeline", icon: GanttChartSquare },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/ai", label: "AI Assistant", icon: Bot },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  workspaces,
  current,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
}) {
  const pathname = usePathname();
  const base = `/app/${current.slug}`;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-sidebar">
      <div className="p-3">
        <Link href="/" className="mb-3 flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">TaskFlow</span>
        </Link>
        <WorkspaceSwitcher workspaces={workspaces} current={current} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV.map((item) => {
          const href = item.href ? `${base}${item.href}` : base;
          const active =
            item.href === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <NavItem
              key={item.href || "overview"}
              href={href}
              icon={item.icon}
              label={item.label}
              active={active}
            />
          );
        })}
      </nav>

      <div className="border-t border-border-subtle p-3 text-[11px] text-faint">
        <p>Plan smarter. Build faster.</p>
        <p className="mt-0.5">Ship together.</p>
      </div>
    </aside>
  );
}
