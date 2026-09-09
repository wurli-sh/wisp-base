"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { Button } from "@/components/ui/Button";
import { fetchMe, getAccessToken, syncWispSession } from "@/lib/auth";
import { useWispWallet } from "@/lib/wallet";

const STEPS = [
  "Sign in",
  "Create wallet",
  "Verify binding",
  "Sync pending gifts",
  "Ready",
] as const;

export function RegisterPanel() {
  const wallet = useWispWallet();
  const [step, setStep] = useState(0);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void getAccessToken().then((t) => {
      if (t) {
        setSignedIn(true);
        setStep(1);
      }
    });
  }, []);

  async function advanceWallet() {
    await wallet.ensureWallet();
    setStep(2);
  }

  async function advanceBind() {
    // Wallet panel owns link flow; mark progress when me.wallet exists
    const me = await fetchMe();
    if (me.ok && me.data.wallet) setStep(3);
    else setStep(2);
  }

  async function advanceSync() {
    await syncWispSession();
    setStep(4);
  }

  return (
    <PageShell title="Register" subtitle="Finish setup to send and claim Wisp gifts.">
      <ol className="mb-8 space-y-2">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`radius-surface-inner flex items-center gap-3 border px-3 py-2.5 text-sm ${
              index === step
                ? "border-brand/30 bg-brand-mist"
                : index < step
                  ? "border-border bg-card"
                  : "border-transparent bg-muted/40 text-muted-foreground"
            }`}
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-brand text-[11px] font-bold text-brand-foreground">
              {index < step ? "✓" : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 || !signedIn ? (
        <SignInAuthPanel
          redirectNext="/register"
          onAuthenticated={() => {
            setSignedIn(true);
            setStep(1);
          }}
        />
      ) : null}
      {step === 1 ? (
        <Button className="w-full" onClick={() => void advanceWallet()}>
          Create / recover embedded wallet
        </Button>
      ) : null}
      {step === 2 ? (
        <div className="space-y-3">
          <Button className="w-full" href="/account?tab=wallet&setup=wallet">
            Verify wallet binding
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => void advanceBind()}>
            I've linked — continue
          </Button>
        </div>
      ) : null}
      {step === 3 ? (
        <Button className="w-full" onClick={() => void advanceSync()}>
          Sync pending gifts
        </Button>
      ) : null}
      {step === 4 ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-success">You're ready to claim and send.</p>
          <Button href="/inbox" className="w-full">
            Open Inbox
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
