import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { listIssuesInWorkspace, createIssue } from "@/lib/services/issue";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const url = new URL(req.url);
    const workspace = url.searchParams.get("workspace");
    if (!workspace) return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
    const filter: Record<string, string> = {};
    for (const key of [
      "q", "projectId", "status", "priority", "type", "assigneeId", "labelId", "sprintId",
      "parentId", "sort", "dir", "page", "pageSize", "dueBefore", "dueAfter",
    ]) {
      const v = url.searchParams.get(key);
      if (v !== null) filter[key] = v;
    }
    if (url.searchParams.get("overdue") === "1") filter.overdue = "true";
    if (url.searchParams.get("includeDone") === "1") filter.includeDone = "true";
    return listIssuesInWorkspace(actor, workspace, filter);
  }, req);
}

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => createIssue(actor, await req.json()), req);
}
