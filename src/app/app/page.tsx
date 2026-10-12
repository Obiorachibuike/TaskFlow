import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";

export default async function AppIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const workspaces = await listWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/onboarding");
  redirect(`/app/${workspaces[0]!.slug}`);
}
