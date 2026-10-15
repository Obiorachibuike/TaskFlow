"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, CheckCircle2, Loader2, ArrowRightCircle, InboxIcon, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function SprintControls({
  sprint,
  canManage,
  nextSprints,
}: {
  sprint: { id: string; status: string; projectId: string; projectKey: string };
  canManage: boolean;
  nextSprints: Array<{ id: string; name: string }>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState("backlog");
  const [nextSprintId, setNextSprintId] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function start() {
    setBusy(true);
    try {
      await apiFetch(`/api/sprints/${sprint.id}/start`, { method: "POST", json: {} });
      toast({ variant: "success", title: "Sprint started" });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not start sprint", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    try {
      await apiFetch(`/api/sprints/${sprint.id}/complete`, {
        method: "POST",
        json: {
          moveUnfinishedTo: moveTo,
          nextSprintId: moveTo === "next-sprint" ? nextSprintId : null,
        },
      });
      toast({ variant: "success", title: "Sprint completed" });
      setCompleteOpen(false);
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not complete sprint", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <div className="flex gap-2">
      {sprint.status === "PLANNED" && (
        <Button onClick={start} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <PlayCircle />}
          Start sprint
        </Button>
      )}
      {sprint.status === "ACTIVE" && (
        <Button variant="success" onClick={() => setCompleteOpen(true)} disabled={busy}>
          <CheckCircle2 />
          Complete sprint
        </Button>
      )}

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete sprint</DialogTitle>
            <DialogDescription>
              Finished issues stay in the sprint for reporting. Choose where unfinished issues
              should go.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">
                  <span className="flex items-center gap-2">
                    <InboxIcon className="h-4 w-4" /> Move to backlog
                  </span>
                </SelectItem>
                <SelectItem value="next-sprint">
                  <span className="flex items-center gap-2">
                    <ArrowRightCircle className="h-4 w-4" /> Move to next sprint
                  </span>
                </SelectItem>
                <SelectItem value="none">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> Remove from sprint only
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {moveTo === "next-sprint" && (
              <Select value={nextSprintId} onValueChange={setNextSprintId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target sprint" />
                </SelectTrigger>
                <SelectContent>
                  {nextSprints.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" onClick={complete} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Complete sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
