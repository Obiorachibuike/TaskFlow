"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function BacklogActions({
  workspaceSlug,
  projectId,
  projectKey,
  sprints,
  issueIds,
  editable,
}: {
  workspaceSlug: string;
  projectId: string;
  projectKey: string;
  sprints: Array<{ id: string; name: string }>;
  issueIds: string[];
  editable: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [addToSprint, setAddToSprint] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function createSprint() {
    if (!name || !start || !end) {
      toast({ variant: "warning", title: "Name and dates are required" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceSlug}/projects/${projectKey}/sprints`, {
        method: "POST",
        json: {
          name,
          goal: goal || undefined,
          startDate: `${start}T00:00:00.000Z`,
          endDate: `${end}T23:59:59.000Z`,
          projectId,
        },
      });
      toast({ variant: "success", title: "Sprint created" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not create sprint", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function addAllToSprint() {
    if (!addToSprint || issueIds.length === 0) return;
    setBusy(true);
    try {
      await apiFetch(`/api/sprints/${addToSprint}/issues`, {
        method: "POST",
        json: { issueIds, action: "add" },
      });
      toast({ variant: "success", title: `Added ${issueIds.length} issue(s) to sprint` });
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not add issues", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {editable && sprints.length > 0 && issueIds.length > 0 && (
        <>
          <Select value={addToSprint} onValueChange={setAddToSprint}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="Add to sprint…" />
            </SelectTrigger>
            <SelectContent>
              {sprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={addAllToSprint} disabled={busy || !addToSprint}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add {issueIds.length}
          </Button>
        </>
      )}
      {editable && (
        <Button onClick={() => setOpen(true)}>
          <CalendarPlus />
          New sprint
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create sprint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 12" />
            </div>
            <div className="space-y-1.5">
              <Label>Goal (optional)</Label>
              <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this sprint achieve?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSprint} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Create sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
