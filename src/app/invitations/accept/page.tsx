import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import AcceptInvitation from "./accept-client";

export const metadata = { title: "Accept invitation" };

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-24 h-[320px] w-full max-w-md" />}>
      <AcceptInvitation />
    </Suspense>
  );
}
