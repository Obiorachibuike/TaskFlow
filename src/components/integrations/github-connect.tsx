"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, GitBranch, Trash2, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function GithubConnect({
  workspaceSlug,
  connected,
  config,
  canManage,
  repos,
}: {
  workspaceSlug: string;
  connected: boolean;
  config: {
    oauthEnabled: boolean;
    webhooksEnabled: boolean;
    tokenStorageEnabled: boolean;
    setupMessage: string | null;
  };
  canManage: boolean;
  repos: string[];
}) {
  const [token, setToken] = React.useState("");
  const [repoInput, setRepoInput] = React.useState(repos.join(", "));
  const [busy, setBusy] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function connect() {
    if (!token.trim()) {
      toast({ variant: "warning", title: "Paste a GitHub token first" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/integrations/github", {
        method: "POST",
        json: {
          workspace: workspaceSlug,
          token: token.trim(),
          repos: repoInput
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
        },
      });
      toast({ variant: "success", title: "GitHub connected", description: "Token stored encrypted." });
      setToken("");
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Connection failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await apiFetch(`/api/integrations/github?workspace=${workspaceSlug}`, { method: "DELETE" });
      toast({ variant: "success", title: "GitHub disconnected" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Disconnect failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Status ok={config.tokenStorageEnabled} label="Encrypted token storage" />
        <Status ok={config.webhooksEnabled} label="Webhook verification" />
        <Status ok={config.oauthEnabled} label="OAuth app" />
      </div>

      {config.setupMessage && (
        <div className="rounded-md border border-warning/40 bg-warning-soft/30 p-3 text-xs text-muted">
          {config.setupMessage}
          <button
            className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => setShowSetup((s) => !s)}
          >
            <BookOpen className="h-3 w-3" />
            {showSetup ? "Hide setup" : "Setup guide"}
          </button>
          {showSetup && (
            <pre className="mt-2 overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-foreground">
{`# .env
GITHUB_CLIENT_ID=...            # OAuth app (optional)
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...       # webhook HMAC secret
INTEGRATION_ENCRYPTION_KEY=...  # openssl rand -hex 32

# Webhook endpoint (repo settings → webhooks):
#   Payload URL: {APP_URL}/api/integrations/github/webhook
#   Content type: application/json
#   Secret: same as GITHUB_WEBHOOK_SECRET
#   Events: push, pull_request

# Branch/PR linking: include the issue key in branch names,
# commit messages, or PR titles (e.g. NOVA-104-fix-auth).`}
            </pre>
          )}
        </div>
      )}

      {connected ? (
        <div className="space-y-3">
          <div className="rounded-md border border-success/30 bg-success-soft/30 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-success" />
              GitHub is connected
            </p>
            {repos.length > 0 && (
              <p className="mt-1 text-xs text-muted">Watching: {repos.join(", ")}</p>
            )}
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Disconnect
            </Button>
          )}
        </div>
      ) : canManage ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>GitHub personal access token</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_… (stored encrypted, never sent to the browser)"
              autoComplete="off"
            />
            <p className="text-[11px] text-faint">
              Needs <code>repo</code> read scope. Validated against the GitHub API before storing.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Repositories to watch (optional, comma-separated)</Label>
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="org/repo-one, org/repo-two"
            />
          </div>
          <Button onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <GitBranch />}
            Connect GitHub
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-faint">
          <XCircle className="h-3.5 w-3.5" />
          Only owners and admins can manage integrations.
        </p>
      )}
    </div>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
        ok ? "bg-success-soft text-success" : "bg-surface-2 text-faint"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
