"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { ClaimPageSkeleton } from "@/components/ui/Skeleton";
import { getAccessToken } from "@/lib/auth";

function CompatClaim() {
  const router = useRouter();
  const search = useSearchParams();
  const gift = search.get("gift");
  const hash = typeof window !== "undefined" ? window.location.hash : "";

  useEffect(() => {
    if (hash) return;
    if (!gift) return;
    void getAccessToken().then((token) => {
      if (token) router.replace(`/claim?gift=${gift}`);
    });
  }, [gift, hash, router]);

  if (hash) {
    return (
      <PageShell title="Link not supported">
        <p className="text-sm text-muted-foreground">
          This link format is not used by Wisp Base. Open Inbox to claim gifts securely.
        </p>
      </PageShell>
    );
  }

  if (!gift) {
    return (
      <PageShell title="Missing gift">
        <p className="text-sm text-muted-foreground">
          Compatibility links require <code>?gift=&lt;uuid&gt;</code>.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Continue to claim" subtitle="Sign in to open this gift.">
      <SignInAuthPanel redirectNext={`/claim?gift=${gift}`} />
    </PageShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<ClaimPageSkeleton />}>
      <CompatClaim />
    </Suspense>
  );
}
