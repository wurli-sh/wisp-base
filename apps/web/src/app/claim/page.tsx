import { Suspense } from "react";
import { ClaimPage } from "@/features/claim/ClaimPage";
import { ClaimPageSkeleton } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<ClaimPageSkeleton />}>
      <ClaimPage />
    </Suspense>
  );
}
