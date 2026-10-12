import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { verifyEmail } from "@/lib/services/account";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let ok = false;
  let message = "";
  let email: string | null = null;

  if (!token) {
    message = "This verification link is missing its token.";
  } else {
    try {
      const result = await verifyEmail(token);
      ok = true;
      email = result.email;
      message = "Your email address has been verified. You can now sign in.";
    } catch (err) {
      message = err instanceof Error ? err.message : "This verification link is invalid.";
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-6 text-center shadow-sm">
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${ok ? "bg-success-soft" : "bg-danger-soft"}`}
      >
        {ok ? (
          <CheckCircle2 className="h-6 w-6 text-success" />
        ) : (
          <XCircle className="h-6 w-6 text-danger" />
        )}
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        {ok ? "Email verified" : "Verification failed"}
      </h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {email && <p className="mt-1 text-sm text-faint">{email}</p>}
      <div className="mt-6 flex justify-center gap-3">
        {ok ? (
          <Button asChild>
            <Link href="/login">Continue to sign in</Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
