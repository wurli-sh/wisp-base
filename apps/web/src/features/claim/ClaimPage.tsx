"use client";

import { PageShell } from "@/components/PageShell";
import { ClaimView } from "@/components/claim/ClaimView";
import { useSearchParams } from "next/navigation";

export function ClaimPage() {
  const search = useSearchParams();
  const giftId = search.get("gift") ?? undefined;
  return (
    <PageShell title="Claim" subtitle="Claim a Wisp test stock gift to your embedded Base wallet.">
      <ClaimView giftId={giftId} />
    </PageShell>
  );
}
