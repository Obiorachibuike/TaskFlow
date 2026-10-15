"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, ChevronRight } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchDialog } from "@/components/app/search-dialog";
import { NotificationBell } from "@/components/app/notification-bell";
import { CreateMenu } from "@/components/app/create-menu";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserAvatar } from "@/components/ui/avatar";

export interface Crumb {
  label: string;
  href?: string;
}

export function Topbar({
  workspaceSlug,
  crumbs,
  user,
  projects,
  unread,
}: {
  workspaceSlug: string;
  crumbs: Crumb[];
  user: { name: string; email: string; image?: string | null; avatarColor?: string | null };
  projects: Array<{ id: string; key: string; name: string; icon: string | null }>;
  unread: number;
}) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface/70 px-4 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
            {c.href ? (
              <Link
                href={c.href}
                className="max-w-[160px] truncate text-muted transition-colors hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span className="max-w-[220px] truncate font-medium text-foreground">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="flex-1" />

      <SearchDialog workspaceSlug={workspaceSlug} />
      <CreateMenu workspaceSlug={workspaceSlug} projects={projects} />
      <NotificationBell workspaceSlug={workspaceSlug} initialUnread={unread} />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center rounded-full outline-none ring-[var(--ring)] focus-visible:ring-2"
          aria-label="User menu"
        >
          <UserAvatar user={user} size="sm" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs text-faint">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/app/${workspaceSlug}/settings?tab=profile`)}>
            <UserIcon />
            Profile settings
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onClick={() => signOut({ redirectTo: "/login" })}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
