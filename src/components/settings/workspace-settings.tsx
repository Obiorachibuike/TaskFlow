"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

const COLORS = ["#6366F1", "#8B5CF6", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];

export function WorkspaceSettings({
  workspace,
  workspaceSlug,
  canManage,
}: {
  workspace: { id: string; name: string; description: string | null; icon: string | null; color: string; slug: string };
  workspaceSlug: string;
  canManage: boolean;
}) {
  const [name, setName] = React.useState(workspace.name);
  const [description, setDescription] = React.useState(workspace.description ?? "");
  const [icon, setIcon] = React.useState(workspace.icon ?? "");
  const [color, setColor] = React.useState(workspace.color);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}`, {
        method: "PATCH",
        json: { name, description, icon: icon || null, color },
      });
      toast({ variant: "success", title: "Workspace updated" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Update failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-sm">Workspace settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Icon (emoji)</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-1.5 pt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={!canManage}
                  className={`h-7 w-7 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-white/60" : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface-2/40 p-3 text-xs text-faint">
          Workspace URL: <span className="font-mono">/app/{workspace.slug}</span> (slug is generated
          automatically and cannot be changed).
        </div>
        {canManage && (
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            Save changes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
