"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Trash2, ShieldCheck, UserPlus, XCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";
import type { MemberRow, InvitationRow } from "@/components/settings/settings-tabs";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "VIEWER", label: "Viewer" },
];

export function MembersSettings({
  workspaceSlug,
  members,
  invitations,
  currentUserId,
  canManage,
  isOwner,
  showInvitations,
}: {
  workspaceSlug: string;
  members: MemberRow[];
  invitations?: InvitationRow[];
  currentUserId: string;
  canManage: boolean;
  isOwner: boolean;
  showInvitations?: boolean;
}) {
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("DEVELOPER");
  const [busy, setBusy] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState<MemberRow | null>(null);
  const [transferConfirm, setTransferConfirm] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function invite() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/invitations`, {
        method: "POST",
        json: { email: inviteEmail.trim(), role: inviteRole },
      });
      toast({ variant: "success", title: "Invitation sent", description: inviteEmail });
      setInviteEmail("");
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not invite", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/invitations/${id}`, { method: "DELETE" });
      toast({ variant: "success", title: "Invitation revoked" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not revoke", description: errorMessage(err) });
    }
  }

  async function changeRole(memberId: string, role: string) {
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/members/${memberId}`, {
        method: "PATCH",
        json: { role },
      });
      toast({ variant: "success", title: "Role updated" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not update role", description: errorMessage(err) });
    }
  }

  async function removeMember(memberId: string) {
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/members/${memberId}`, { method: "DELETE" });
      toast({ variant: "success", title: "Member removed" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not remove member", description: errorMessage(err) });
    }
  }

  async function transferOwnership() {
    if (!transferTarget) return;
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/members/transfer`, {
        method: "POST",
        json: { memberId: transferTarget.id, confirmText: transferConfirm },
      });
      toast({ variant: "success", title: "Ownership transferred" });
      setTransferTarget(null);
      setTransferConfirm("");
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Transfer failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlus className="h-4 w-4 text-primary" />
              Invite a member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={invite} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                Send invitation
              </Button>
            </div>
            <p className="mt-2 text-xs text-faint">
              Invitations expire after 7 days and can be revoked below.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => {
            const isSelf = m.user.id === currentUserId;
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle p-2.5"
              >
                <UserAvatar user={m.user} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {m.user.name}
                    {isSelf && <Badge variant="secondary">you</Badge>}
                    {m.role === "OWNER" && (
                      <Badge variant="warning">
                        <Crown className="h-3 w-3" />
                        Owner
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-faint">{m.user.email}</p>
                </div>
                {canManage && m.role !== "OWNER" ? (
                  <>
                    <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTransferTarget(m)}
                        title="Transfer ownership"
                      >
                        <Crown />
                        Transfer
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeMember(m.id)}
                      aria-label={`Remove ${m.user.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline">{m.role.replace("_", " ")}</Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {showInvitations && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(invitations ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-faint">No pending invitations.</p>
            )}
            {(invitations ?? []).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle p-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                  <Mail className="h-4 w-4 text-muted" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">{inv.email}</p>
                  <p className="text-xs text-faint">
                    {inv.role.replace("_", " ")} · invited by {inv.inviter.name} · expires{" "}
                    {formatDate(inv.expiresAt)}
                  </p>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(inv.id)}>
                    <XCircle />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-warning" />
              Transfer workspace ownership
            </DialogTitle>
            <DialogDescription>
              {transferTarget?.user.name} will become the Owner of this workspace and you will become
              an Admin. This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type TRANSFER to confirm</Label>
            <Input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={transferOwnership}
              disabled={busy || transferConfirm.trim().toUpperCase() !== "TRANSFER"}
            >
              {busy && <Loader2 className="animate-spin" />}
              Transfer ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
