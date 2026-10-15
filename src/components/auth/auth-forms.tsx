"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Loader2, MailCheck, KeyRound, ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type RegisterInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validation";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function GoogleButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => signIn("google", { redirectTo: "/app" })}
    >
      <Globe />
      Continue with Google
    </Button>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const registered = params.get("registered");
  const callbackUrl = params.get("callbackUrl") ?? "/app";

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    try {
      const res = await signIn("credentials", { ...values, redirect: false });
      if (res?.error === "EMAIL_NOT_VERIFIED") {
        toast({
          variant: "warning",
          title: "Email not verified",
          description: "Check your inbox for the verification link, or resend it below.",
        });
      } else if (res?.error) {
        toast({
          variant: "error",
          title: "Sign in failed",
          description: "Invalid email or password.",
        });
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    const email = form.getValues("email");
    if (!email) {
      toast({ variant: "warning", title: "Enter your email first" });
      return;
    }
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "resend-verification", email }),
    });
    toast({
      variant: "success",
      title: "Verification email sent",
      description: "If an account exists for that address, a link is on its way.",
    });
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to your TaskFlow workspace.</p>

      {registered && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-sm">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>
            Account created. Check your inbox to verify your email before signing in.
          </div>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={!!form.formState.errors.email}
            {...form.register("email")}
          />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!form.formState.errors.password}
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>

      <div className="mt-3 flex items-center justify-between text-xs">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        <button type="button" onClick={resendVerification} className="text-muted hover:text-foreground">
          Resend verification
        </button>
      </div>

      {googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-faint">
            <div className="h-px flex-1 bg-border-subtle" />
            or
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <GoogleButton />
        </>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: RegisterInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "error",
          title: "Registration failed",
          description: data.error ?? "Please try again.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Account created",
        description: "We've sent a verification link to your email.",
      });
      router.push("/login?registered=1");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Start planning smarter in a few seconds.</p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <Field label="Full name" error={form.formState.errors.name?.message}>
          <Input
            autoComplete="name"
            placeholder="Ada Lovelace"
            invalid={!!form.formState.errors.name}
            {...form.register("name")}
          />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={!!form.formState.errors.email}
            {...form.register("email")}
          />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters, with a number"
            invalid={!!form.formState.errors.password}
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Create account
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-faint">
            <div className="h-px flex-1 bg-border-subtle" />
            or
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <GoogleButton />
        </>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSent(true);
      toast({
        variant: "success",
        title: "Check your email",
        description: "If an account exists for that address, a reset link is on its way.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
        <KeyRound className="h-5 w-5 text-primary" />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email and we&apos;ll send you a secure reset link.
      </p>

      {sent ? (
        <div className="mt-5 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm">
          If an account exists for that address, a reset link has been sent. The link expires in 1
          hour.
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const token = params.get("token") ?? "";
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
    values: { token, password: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "error",
          title: "Reset failed",
          description: data.error ?? "The link may have expired. Request a new one.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Password updated",
        description: "Sign in with your new password.",
      });
      router.push("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted">Your new password must be at least 8 characters.</p>

      {!token ? (
        <div className="mt-5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          This reset link is missing its token. Request a new link from the{" "}
          <Link href="/forgot-password" className="text-primary hover:underline">
            forgot password
          </Link>{" "}
          page.
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <Field label="New password" error={form.formState.errors.password?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters, with a number"
              invalid={!!form.formState.errors.password}
              {...form.register("password")}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}
