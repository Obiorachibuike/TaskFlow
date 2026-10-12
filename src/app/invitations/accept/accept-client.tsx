"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export default function AcceptInvitation() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [info, setInfo] = React.useState<{
    workspace: { name: string; slug: string };
    inviter: { name: string };
    role: string;
    email: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const data = await apiFetch<{
          workspace: { name: string; slug: string };
          inviter: { name: string };
          role: string;
          email: string;
        }>(`/api/invitations/${encodeURIComponent(token)}`);
        setInfo(data);
      } catch (err) {
        setError(errorMessage(err, "This invitation link is invalid or expired."));
      }
    })();
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const ws = await apiFetch<{ slug: string }>(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      toast({ variant: "success", title: "Welcome aboard!", description: `Joined ${info?.workspace.name}` });
      router.push(`/app/${ws.slug}`);
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not accept", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-6 text-center shadow-sm">
        {error ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
              <XCircle className="h-6 w-6 text-danger" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Button className="mt-6" variant="outline" asChild>
              <Link href="/app">Go to TaskFlow</Link>
            </Button>
          </>
        ) : !info ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
            <p className="text-sm text-muted">Checking invitation…</p>
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">Join {info.workspace.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {info.inviter.name} invited <span className="text-foreground">{info.email}</span> to
              collaborate as <span className="font-medium text-foreground">{info.role.replace("_", " ")}</span>.
            </p>

            {status === "loading" ? (
              <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-muted" />
            ) : session?.user ? (
              <Button className="mt-6 w-full" onClick={accept} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Accept invitation
              </Button>
            ) : (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-faint">Sign in with {info.email} to accept.</p>
                <Button className="w-full" asChild>
                  <Link href={`/login?callbackUrl=/invitations/accept?token=${encodeURIComponent(token)}`}>
                    Sign in to accept
                  </Link>
                </Button>
                <Button className="w-full" variant="outline" asChild>
                  <Link href="/register">Create an account</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
