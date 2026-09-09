"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { GoogleIcon, XBrandIcon } from "@/components/icons";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/auth";
import { prepareOAuthRedirect } from "@/lib/app-origin";
import { TOAST } from "@/lib/brand-copy";
import { userFacingError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import {
  toSupabaseProvider,
  type WispOAuthProvider,
} from "@/lib/supabase/providers";
import { cn } from "@/lib/cn";

type Props = {
  redirectNext?: string;
  authError?: boolean;
  className?: string;
  onAuthenticated?: () => void;
};

export function SignInAuthPanel({
  redirectNext = "/account",
  authError = false,
  className,
  onAuthenticated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (authError) toast.error(TOAST.signInFailed);
  }, [authError]);

  async function oauth(provider: WispOAuthProvider) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: toSupabaseProvider(provider),
        options: { redirectTo: prepareOAuthRedirect(redirectNext) },
      });
      if (error) toast.error(userFacingError(error, TOAST.signInFailed));
    } catch (e) {
      toast.error(userFacingError(e, TOAST.signInFailed));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    try {
      const result = await sendEmailOtp(email);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setOtpSent(true);
      toast.success(TOAST.codeSent);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    try {
      const result = await verifyEmailOtp(email, code);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onAuthenticated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-col gap-3">
        <Button data-testid="auth-google" disabled={busy} variant="outline" onClick={() => void oauth("google")}>
          <GoogleIcon className="h-4 w-4" />
          Continue with Google
        </Button>
        <Button data-testid="auth-x" disabled={busy} variant="outline" onClick={() => void oauth("x")}>
          <XBrandIcon className="h-4 w-4" />
          Continue with X
        </Button>
      </div>

      <div className="relative text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="bg-brand-mist px-2">or email</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border/70" />
      </div>

      {!otpSent ? (
        <div className="space-y-3">
          <label htmlFor="otp-email" className="sr-only">
            Email
          </label>
          <input
            id="otp-email"
            data-testid="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="radius-control h-11 w-full border border-border bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button disabled={busy || !email.includes("@")} className="w-full" onClick={() => void sendCode()}>
            Send code
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor="otp-code" className="sr-only">
            Code
          </label>
          <input
            id="otp-code"
            data-testid="auth-otp"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="radius-control h-11 w-full border border-border bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button disabled={busy || code.trim().length < 6} className="w-full" onClick={() => void verifyCode()}>
            Verify and continue
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => {
              setOtpSent(false);
              setCode("");
            }}
          >
            Use a different email
          </button>
        </div>
      )}
    </div>
  );
}
