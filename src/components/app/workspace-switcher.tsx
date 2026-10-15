"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  role: string;
}

export function WorkspaceSwitcher({
  workspaces,
  current,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-2/60 px-2.5 py-2 text-left transition-colors hover:bg-surface-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
          style={{ background: current.color ?? "#6366F1" }}
        >
          {current.icon ?? current.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{current.name}</div>
          <div className="truncate text-[11px] text-faint">{current.role.replace("_", " ")}</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => router.push(`/app/${ws.slug}`)}
            className="gap-2.5"
          >
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold text-white"
              style={{ background: ws.color ?? "#6366F1" }}
            >
              {ws.icon ?? ws.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="flex-1 truncate">{ws.name}</span>
            {ws.slug === current.slug && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding")}>
          <Plus />
          Create workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/app/${current.slug}/settings`)}>
          <Settings />
          Workspace settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-faint">
          <Zap className="h-3 w-3" />
          Plan smarter. Build faster.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary-soft font-medium text-primary"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
