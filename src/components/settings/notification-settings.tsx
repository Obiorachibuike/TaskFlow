"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

const FIELDS = [
  { key: "emailInvites", label: "Email: workspace invitations", channel: "email" },
  { key: "emailAssignments", label: "Email: issue assignments", channel: "email" },
  { key: "emailMentions", label: "Email: @mentions", channel: "email" },
  { key: "emailDueDate", label: "Email: due-date reminders", channel: "email" },
  { key: "emailStatusChange", label: "Email: status changes", channel: "email" },
  { key: "inAppMentions", label: "In-app: @mentions", channel: "in-app" },
  { key: "inAppAssignments", label: "In-app: issue assignments", channel: "in-app" },
  { key: "inAppStatusChange", label: "In-app: status changes", channel: "in-app" },
] as const;

export function NotificationSettings() {
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<Record<string, boolean>>("/api/profile/notifications");
        setPrefs(data as unknown as Record<string, boolean>);
      } catch {
        /* defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    try {
      await apiFetch("/api/profile/notifications", { method: "PUT", json: prefs });
      toast({ variant: "success", title: "Preferences saved" });
    } catch (err) {
      toast({ variant: "error", title: "Could not save", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-sm">Notification preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-faint">Loading…</p>}
        {!loading &&
          FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-4">
              <Label htmlFor={f.key} className="cursor-pointer">
                {f.label}
              </Label>
              <Switch
                id={f.key}
                checked={prefs[f.key] ?? true}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [f.key]: v }))}
              />
            </div>
          ))}
        <Button onClick={save} disabled={busy || loading}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
