import { type NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { myIssues } from "@/lib/services/issue";

export async function GET(req: NextRequest) {
  return handleApi(async (actor) => {
    const workspace = new URL(req.url).searchParams.get("workspace");
    if (!workspace) return { issues: [] };
    const includeDone = new URL(req.url).searchParams.get("includeDone") === "1";
    return { issues: await myIssues(actor, workspace, { includeDone }) };
  }, req);
}
