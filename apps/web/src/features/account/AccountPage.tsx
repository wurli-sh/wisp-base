"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { HandlesPanel } from "@/components/account/HandlesPanel";
import { WalletPanel } from "@/components/account/WalletPanel";
import {
  AUTH_SESSION_EVENT,
  fetchMe,
  getAccessToken,
  type MeResponse,
} from "@/lib/auth";
import { TOAST } from "@/lib/brand-copy";
import { userFacingError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type Tab = "handles" | "wallet";

export function AccountPage() {
  const router = useRouter();
  const search = useSearchParams();
  const rawTab = search.get("tab");
  const tab: Tab = rawTab === "wallet" ? "wallet" : "handles";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  async function reload() {
    const token = await getAccessToken();
    setSignedIn(Boolean(token));
    try {
      const { data } = await createClient().auth.getSession();
      setSession(data.session);
    } catch {
      setSession(null);
    }
    if (!token) {
      setMe(null);
      return;
    }
    const result = await fetchMe(token);
    if (result.ok) setMe(result.data);
    else {
      toast.error(userFacingError(result.error, "Could not refresh account"), {
        id: "account-refresh",
      });
    }
  }

  useEffect(() => {
    void reload();
    const onSession = () => void reload();
    window.addEventListener(AUTH_SESSION_EVENT, onSession);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, onSession);
    };
  }, []);

  useEffect(() => {
    const authError = search.get("authError");
    if (!authError) return;
    toast.error(userFacingError(authError, TOAST.signInFailed), {
      id: "auth-callback-error",
    });
    const query = new URLSearchParams(search.toString());
    query.delete("authError");
    router.replace(query.size ? `/account?${query}` : "/account", { scroll: false });
  }, [router, search]);

  useEffect(() => {
    if (rawTab !== "activity") return;
    router.replace("/account?tab=handles", { scroll: false });
  }, [rawTab, router]);

  if (!signedIn) {
    return (
      <PageShell title="Account" subtitle="Sign in to manage handles and wallet.">
        <SignInAuthPanel redirectNext="/account" onAuthenticated={() => void reload()} />
      </PageShell>
    );
  }

  return (
    <PageShell title="Account" subtitle="Handles and embedded Base wallet.">
      <div className="mb-6 flex justify-center">
        <SegmentedTabs
          layoutId="account-tabs"
          ariaLabel="Account sections"
          value={tab}
          onValueChange={(next) => router.replace(`/account?tab=${next}`)}
          items={[
            { value: "handles", label: "Handles" },
            { value: "wallet", label: "Wallet" },
          ]}
        />
      </div>
      {tab === "handles" ? (
        <HandlesPanel me={me} session={session} onChanged={() => void reload()} />
      ) : null}
      {tab === "wallet" ? (
        <WalletPanel me={me} onChanged={() => void reload()} />
      ) : null}
    </PageShell>
  );
}
