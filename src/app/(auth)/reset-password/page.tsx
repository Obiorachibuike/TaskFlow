import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
