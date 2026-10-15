"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { createIssueSchema, type CreateIssueInput } from "@/lib/validation";
import { apiFetch, errorMessage } from "@/lib/client-api";

const TYPES = ["TASK", "STORY", "BUG", "EPIC", "SUBTASK"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

export function CreateIssueDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  defaultStatus,
  defaultType,
  defaultParentId,
  defaultSprintId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projects: Array<{ id: string; key: string; name: string; icon?: string | null }>;
  defaultProjectId?: string;
  defaultStatus?: string;
  defaultType?: string;
  defaultParentId?: string;
  defaultSprintId?: string;
  onCreated?: (issue: { id: string; key: string; title: string }) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<CreateIssueInput>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: {
      projectId: defaultProjectId ?? projects[0]?.id ?? "",
      title: "",
      description: "",
      type: (defaultType as CreateIssueInput["type"]) ?? "TASK",
      priority: "MEDIUM",
      status: defaultStatus,
      parentIssueId: defaultParentId,
      sprintId: defaultSprintId,
    },
    values: {
      projectId: defaultProjectId ?? projects[0]?.id ?? "",
      title: "",
      description: "",
      type: (defaultType as CreateIssueInput["type"]) ?? "TASK",
      priority: "MEDIUM",
      status: defaultStatus,
      parentIssueId: defaultParentId,
      sprintId: defaultSprintId,
    },
  });

  async function onSubmit(values: CreateIssueInput) {
    setSubmitting(true);
    try {
      const issue = await apiFetch<{ id: string; key: string; title: string }>("/api/issues", {
        method: "POST",
        json: values,
      });
      toast({ variant: "success", title: `${issue.key} created`, description: issue.title });
      onCreated?.(issue);
      form.reset({ ...values, title: "", description: "" });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "error", title: "Could not create issue", description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create issue</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.watch("projectId")}
                onValueChange={(v) => form.setValue("projectId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ""}
                      {p.name} ({p.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as CreateIssueInput["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              placeholder="Describe the task in one line"
              invalid={!!form.formState.errors.title}
              {...form.register("title")}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-danger">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea rows={4} placeholder="Acceptance notes, context, links…" {...form.register("description")} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(v) => form.setValue("priority", v as CreateIssueInput["priority"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" {...form.register("dueDate")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
