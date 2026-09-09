import { Suspense } from "react";
import { AccountPage } from "@/features/account/AccountPage";
import { AccountSkeleton } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountPage />
    </Suspense>
  );
}
