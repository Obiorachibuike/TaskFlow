"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function ProfileSettings({
  user,
}: {
  user: { id: string; name: string; email: string; image: string | null; avatarColor: string | null; timeZone: string };
}) {
  const [name, setName] = React.useState(user.name);
  const [timeZone, setTimeZone] = React.useState(user.timeZone);
  const [busy, setBusy] = React.useState(false);
  const [pw, setPw] = React.useState({ current: "", next: "" });
  const [pwBusy, setPwBusy] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function save() {
    setBusy(true);
    try {
      await apiFetch("/api/profile", { method: "PATCH", json: { name, timeZone } });
      toast({ variant: "success", title: "Profile updated" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Update failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPwBusy(true);
    try {
      await apiFetch("/api/profile/password", {
        method: "POST",
        json: { currentPassword: pw.current, newPassword: pw.next },
      });
      toast({ variant: "success", title: "Password changed" });
      setPw({ current: "", next: "" });
    } catch (err) {
      toast({ variant: "error", title: "Could not change password", description: errorMessage(err) });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size="lg" />
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-faint">{user.email}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Time zone</Label>
            <Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="UTC" />
          </div>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4" />
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <Input
              type="password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
              placeholder="At least 8 characters, with a number"
            />
          </div>
          <Button onClick={changePassword} disabled={pwBusy || !pw.current || !pw.next}>
            {pwBusy ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Update password
          </Button>
          <p className="text-xs text-faint">
            Google OAuth accounts don&apos;t have a local password; use your Google sign-in instead.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
