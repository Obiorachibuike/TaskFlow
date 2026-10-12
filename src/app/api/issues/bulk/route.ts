import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { bulkUpdateIssues } from "@/lib/services/issue";

export async function POST(req: NextRequest) {
  return handleApi(async (actor) => {
    const body = await req.json();
    return bulkUpdateIssues(actor, body.workspace, body);
  }, req);
}
