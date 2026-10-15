"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, FolderPlus } from "lucide-react";
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
import { createProjectSchema, type CreateProjectInput } from "@/lib/validation";
import { apiFetch, errorMessage } from "@/lib/client-api";

const COLORS = ["#6366F1", "#8B5CF6", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];
const ICONS = ["🚀", "⚡", "🧪", "🛠️", "📦", "🎯", "🔥", "💡", "🧭", "🏗️"];

export function CreateProjectButton({
  workspaceSlug,
  variant = "button",
}: {
  workspaceSlug: string;
  variant?: "button" | "card";
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [color, setColor] = React.useState(COLORS[0]!);
  const [icon, setIcon] = React.useState(ICONS[0]!);

  React.useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "", description: "", key: undefined },
  });

  async function onSubmit(values: CreateProjectInput) {
    setSubmitting(true);
    try {
      const project = await apiFetch<{ key: string }>(`/api/workspaces/${workspaceSlug}/projects`, {
        method: "POST",
        json: {
          ...values,
          key: values.key || undefined,
          color,
          icon,
        },
      });
      toast({ variant: "success", title: "Project created", description: `Issue keys use ${project.key}-…` });
      setOpen(false);
      form.reset();
      router.push(`/app/${workspaceSlug}/projects/${project.key}`);
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not create project", description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {variant === "button" ? (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          New project
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-muted transition-colors hover:border-primary/50 hover:text-primary"
        >
          <FolderPlus className="h-6 w-6" />
          <span className="text-sm">New project</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Nova Platform"
                invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label>Key (optional)</Label>
                <Input
                  placeholder="NOVA"
                  className="font-mono uppercase"
                  {...form.register("key", { setValueAs: (v) => (v ? String(v).toUpperCase() : undefined) })}
                />
                {form.formState.errors.key && (
                  <p className="text-xs text-danger">{form.formState.errors.key.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.watch("status") ?? "ACTIVE"}
                  onValueChange={(v) => form.setValue("status", v as CreateProjectInput["status"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["PLANNED", "ACTIVE", "ON_HOLD"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} placeholder="What is this project about?" {...form.register("description")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-1.5">
                <Label>Target date</Label>
                <Input type="date" {...form.register("targetDate")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-colors ${
                      icon === i ? "border-primary bg-primary-soft" : "border-border-subtle hover:bg-surface-2"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-white/60" : ""}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
