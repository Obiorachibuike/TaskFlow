"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createWorkspaceSchema, type CreateWorkspaceInput } from "@/lib/validation";
import { apiFetch, errorMessage } from "@/lib/client-api";

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", description: "" },
  });

  async function onSubmit(values: CreateWorkspaceInput) {
    setSubmitting(true);
    try {
      const ws = await apiFetch<{ slug: string }>("/api/workspaces", {
        method: "POST",
        json: values,
      });
      toast({ variant: "success", title: "Workspace created", description: "Welcome to TaskFlow!" });
      router.push(`/app/${ws.slug}`);
      router.refresh();
    } catch (err) {
      toast({ variant: "error", title: "Could not create workspace", description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Welcome to TaskFlow</h1>
            <p className="text-sm text-muted">Create your first workspace to get started.</p>
          </div>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4 rounded-xl border border-border-subtle bg-surface p-6 shadow-sm"
        >
          <div className="space-y-1.5">
            <Label>Workspace name</Label>
            <Input
              placeholder="Acme Engineering"
              invalid={!!form.formState.errors.name}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What does your team work on?"
              rows={3}
              {...form.register("description")}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Create workspace
            <ArrowRight />
          </Button>
          <p className="text-center text-xs text-faint">
            You&apos;ll be the Owner. You can invite teammates after creating the workspace.
          </p>
        </form>
      </div>
    </div>
  );
}
