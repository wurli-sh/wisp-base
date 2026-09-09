import { Suspense } from "react";
import { SendPage } from "@/features/send/SendPage";
import { SendPageSkeleton } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<SendPageSkeleton />}>
      <SendPage />
    </Suspense>
  );
}
