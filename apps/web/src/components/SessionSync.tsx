"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { clearStaleSupabaseLocalStorage, syncWispSession } from "@/lib/auth";
import { TOAST } from "@/lib/brand-copy";
import { userFacingError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

/** Keeps Wisp profile/inbox in sync after OAuth callbacks and auth changes. */
export function SessionSync() {
  const lastToken = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    clearStaleSupabaseLocalStorage();
    try {
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data }) => {
        lastToken.current = data.session?.access_token ?? null;
        if (data.session) {
          void syncWispSession().catch((e) => {
            toast.error(userFacingError(e, TOAST.signInFailed), { id: "session-sync" });
          });
        }
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const token = session?.access_token ?? null;
        if (lastToken.current === token) return;
        lastToken.current = token;
        if (session) {
          void syncWispSession().catch((e) => {
            toast.error(userFacingError(e, TOAST.signInFailed), { id: "session-sync" });
          });
        }
      });
      return () => sub.subscription.unsubscribe();
    } catch {
      /* Supabase may be unconfigured in some test builds */
    }
  }, []);

  return null;
}
