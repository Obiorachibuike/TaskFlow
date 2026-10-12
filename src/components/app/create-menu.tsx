"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, ListTodo, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { CreateIssueDialog } from "@/components/issue/create-issue-dialog";

export function CreateMenu({
  workspaceSlug,
  projects,
}: {
  workspaceSlug: string;
  projects: Array<{ id: string; key: string; name: string; icon: string | null }>;
}) {
  const router = useRouter();
  const [issueOpen, setIssueOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus />
            Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setIssueOpen(true)} disabled={projects.length === 0}>
            <ListTodo />
            New issue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/app/${workspaceSlug}/projects?new=1`)}>
            <FolderKanban />
            New project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/app/${workspaceSlug}/ai`)}>
            <Zap />
            Ask AI assistant
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        workspaceSlug={workspaceSlug}
        projects={projects}
      />
    </>
  );
}
