"use client";

import * as React from "react";
import { BoardView, type BoardData } from "@/components/board/board-view";
import { useRouter } from "next/navigation";

export function BoardPageClient({
  data,
  workspaceSlug,
  canEdit,
  members,
  labels,
  projects,
}: {
  data: BoardData;
  workspaceSlug: string;
  canEdit: boolean;
  members: Array<{ userId: string; name: string; avatarColor: string | null; image: string | null }>;
  labels: Array<{ id: string; name: string; color: string }>;
  projects: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">
          {data.project.icon ? `${data.project.icon} ` : ""}
          {data.project.name} Board
        </h1>
        <span className="font-mono text-xs text-faint">{data.project.key}</span>
        <span className="flex-1" />
        {projects.length > 1 && (
          <select
            className="h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs"
            value={data.project.key}
            onChange={(e) => router.push(`/app/${workspaceSlug}/projects/${e.target.value}/board`)}
            aria-label="Switch project"
          >
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <BoardView
        initial={data}
        workspaceSlug={workspaceSlug}
        canEdit={canEdit}
        members={members}
        labels={labels}
      />
    </div>
  );
}
