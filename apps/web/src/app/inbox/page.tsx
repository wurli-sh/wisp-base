import { Suspense } from "react";
import { InboxPage } from "@/features/inbox/InboxPage";
import { InboxSkeleton } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxPage />
    </Suspense>
  );
}
