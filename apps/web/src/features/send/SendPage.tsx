"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Droplets } from "lucide-react";
import type { Address } from "viem";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { RecipientInput, type RecipientStatus } from "@/components/RecipientInput";
import { SignInModal } from "@/components/SignInModal";
import { StockAmountInput } from "@/components/StockAmountInput";
import { StockPicker } from "@/components/StockPicker";
import { Button } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { TextShimmer } from "@/components/ui/TextShimmer";
import { ClaimView } from "@/components/claim/ClaimView";
import { apiFetch } from "@/lib/api/client";
import { fetchMe, getAccessToken } from "@/lib/auth";
import {
  contractAddresses,
  loadDeployment,
  mockUsdcAbi,
  publicClient,
} from "@/lib/chain";
import { userFacingError } from "@/lib/errors";
import { formatUsdcRaw } from "@/lib/format/amount";
import {
  formatStockAmount,
  formatUsdFromE6,
  quoteStockAmount,
  stockByKey,
  usdDollarsToUsdcRaw,
  type StockKey,
} from "@/lib/stocks";
import { parseRecipient } from "@/lib/recipient";
import { useWispWallet } from "@/lib/wallet";
import { SEND_PROGRESS_STAGES } from "./sendReducer";
import { useSendController } from "./useSendController";

type TusdcChip = {
  connected: boolean;
  loading: boolean;
  balance: string | null;
};

export function SendPage() {
  const router = useRouter();
  const search = useSearchParams();
  const wallet = useWispWallet();
  const tab = search.get("tab") === "claim" ? "claim" : "send";
  const giftId = search.get("gift") ?? undefined;
  const prefillTo = search.get("to") ?? "";

  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [stockKey, setStockKey] = useState<StockKey>("WISPAAPL");
  const [usdAmount, setUsdAmount] = useState("25");
  const [recipient, setRecipient] = useState(prefillTo);
  const [recipientStatus, setRecipientStatus] = useState<RecipientStatus>("idle");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [unlockHours, setUnlockHours] = useState(0);
  const [boundAddress, setBoundAddress] = useState<Address | null>(null);
  const [tusdc, setTusdc] = useState<TusdcChip>({
    connected: false,
    loading: false,
    balance: null,
  });
  const { state, send } = useSendController();

  const balanceAddress = (wallet.address ?? boundAddress) as Address | null;

  const refreshTusdc = useCallback(async (address: Address) => {
    const manifest = await loadDeployment();
    const { mockUsdc } = contractAddresses(manifest);
    const bal = await publicClient.readContract({
      address: mockUsdc,
      abi: mockUsdcAbi,
      functionName: "balanceOf",
      args: [address],
    });
    return formatUsdcRaw(bal);
  }, []);

  useEffect(() => {
    void getAccessToken().then((tok) => setSignedIn(Boolean(tok)));
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setBoundAddress(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (cancelled || !me.ok) return;
      const next = me.data.wallet?.address;
      setBoundAddress(next ? (next as Address) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!balanceAddress) {
      setTusdc({ connected: false, loading: false, balance: null });
      return;
    }
    let cancelled = false;
    setTusdc((prev) => ({
      connected: true,
      loading: true,
      balance: prev.connected ? prev.balance : null,
    }));
    void (async () => {
      try {
        const balance = await refreshTusdc(balanceAddress);
        if (!cancelled) setTusdc({ connected: true, loading: false, balance });
      } catch {
        if (!cancelled) {
          setTusdc((prev) => ({
            connected: true,
            loading: false,
            balance: prev.balance,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [balanceAddress, refreshTusdc]);

  useEffect(() => {
    const parsed = parseRecipient(recipient);
    if (!parsed.ok) {
      setRecipientStatus("idle");
      return;
    }
    let cancelled = false;
    setRecipientStatus("checking");
    const handle = window.setTimeout(() => {
      void (async () => {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) setRecipientStatus("not_joined");
          return;
        }
        try {
          const res = await apiFetch<{ descriptor: { registered: boolean; kind: string; recipientAddress: string | null } }>("/v1/resolve", {
            token,
            body: { kind: parsed.kind, identifier: parsed.identifier },
          });
          if (cancelled) return;
          if (res.descriptor.registered) setRecipientStatus("on_wisp");
          else if (res.descriptor.kind === "basename" && res.descriptor.recipientAddress) setRecipientStatus("basename_resolved");
          else setRecipientStatus("not_joined");
        } catch (error) {
          if (!cancelled) {
            setRecipientStatus("unavailable");
            toast.error(userFacingError(error, "Recipient lookup unavailable"), { id: "recipient-lookup" });
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [recipient]);

  const stock = stockByKey(stockKey)!;
  const usdcRaw = usdDollarsToUsdcRaw(usdAmount) ?? 0n;
  const quoted = quoteStockAmount(usdcRaw, stock.defaultUsdPriceE6);

  const progressStages = useMemo(() => {
    if (state.usePermit) {
      return SEND_PROGRESS_STAGES.filter((s) => s.id !== "approving_test_usdc");
    }
    return [...SEND_PROGRESS_STAGES];
  }, [state.usePermit]);

  async function onSend() {
    if (!signedIn) {
      setSignInOpen(true);
      return;
    }
    try {
      const now = new Date();
      const unlocks = new Date(now.getTime() + unlockHours * 3600_000);
      const expires = new Date(unlocks.getTime() + expiryDays * 86400_000);
      await send({
        stockKey,
        usdAmount,
        recipient,
        unlockAt: unlocks,
        expiresAt: expires,
        message,
        anonymousSender: anonymous,
      });
      toast.success("Gift sent");
      const address = wallet.address ?? boundAddress;
      if (address) {
        try {
          const balance = await refreshTusdc(address);
          setTusdc({ connected: true, loading: false, balance });
        } catch {
          // Keep the last known chip balance if the post-send refresh fails.
        }
      }
    } catch (e) {
      const msg = userFacingError(e, "Could not send gift");
      toast.error(msg);
    }
  }

  return (
    <PageShell
      title="Send"
      subtitle="Gift a Wisp test stock on Base Sepolia to an email, @handle, or Basename."
      maxWidth="md"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          layoutId="send-claim"
          ariaLabel="Send or claim"
          value={tab}
          onValueChange={(next) => {
            const params = new URLSearchParams(search.toString());
            if (next === "claim") params.set("tab", "claim");
            else {
              params.delete("tab");
              params.delete("gift");
            }
            router.replace(`/send?${params.toString()}`);
          }}
          items={[
            { value: "send", label: "Send" },
            { value: "claim", label: "Claim" },
          ]}
        />
        <AvailableTusdc chip={tusdc} />
      </div>

      {tab === "claim" ? (
        <ClaimView embedded giftId={giftId} />
      ) : (
        <div className="radius-surface overflow-hidden border border-border/80 bg-card p-2 shadow-card">
          <div className="radius-surface-inner space-y-5 border border-brand/15 bg-brand-mist px-5 py-6 sm:px-7 sm:py-7">
            <StockPicker value={stockKey} onChange={setStockKey} />
            <StockAmountInput value={usdAmount} onChange={setUsdAmount} />
            <p className="text-sm text-muted-foreground">
              ≈ {formatStockAmount(quoted)} {stock.symbol}{" "}
              <span className="text-xs">(quote at send · not live brokerage)</span>
            </p>
          </div>
          <div className="space-y-5 px-3 pb-3 pt-5 sm:px-4 sm:pb-4">
            <RecipientInput
              value={recipient}
              onChange={setRecipient}
              status={recipientStatus}
            />
            <div className="space-y-2">
              <span className="text-sm font-medium">Unlocks</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { hours: 0, label: "Now" },
                  { hours: 24, label: "In 1 day" },
                  { hours: 72, label: "In 3 days" },
                ].map((option) => (
                  <button
                    key={option.hours}
                    type="button"
                    onClick={() => setUnlockHours(option.hours)}
                    className={`radius-control min-h-10 px-4 text-sm font-semibold ${
                      unlockHours === option.hours
                        ? "bg-selection text-selection-foreground"
                        : "bg-muted text-muted-foreground hover:bg-selection-hover"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Expires after unlock</span>
              <div className="flex flex-wrap gap-2">
                {[3, 7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setExpiryDays(d)}
                    className={`radius-control min-h-10 px-4 text-sm font-semibold ${
                      expiryDays === d
                        ? "bg-selection text-selection-foreground"
                        : "bg-muted text-muted-foreground hover:bg-selection-hover"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium">
                Message (optional)
              </label>
              <textarea
                id="message"
                maxLength={280}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="radius-surface-inner min-h-24 w-full border border-border bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="size-4"
              />
              Hide my name in Wisp Inbox (blockchain stays public)
            </label>

            {(() => {
              const inFlight =
                state.stage !== "idle" && state.stage !== "error" && state.stage !== "complete";
              const stageLabel =
                progressStages.find((s) => s.id === state.stage)?.label ?? "Working…";
              return (
                <Button
                  data-testid="send-gift"
                  className="w-full"
                  disabled={inFlight}
                  aria-busy={inFlight || undefined}
                  onClick={() => void onSend()}
                >
                  {inFlight ? (
                    <TextShimmer tone="on-dark">{stageLabel}</TextShimmer>
                  ) : state.stage === "complete" ? (
                    "Gift sent"
                  ) : (
                    <>Send gift · {formatUsdFromE6(usdcRaw)}</>
                  )}
                </Button>
              );
            })()}
            <p className="text-center text-[11px] text-muted-foreground">
              Base Sepolia · test assets — not real Coinbase shares
            </p>
          </div>
        </div>
      )}

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={() => setSignedIn(true)} />
    </PageShell>
  );
}

function AvailableTusdc({ chip }: { chip: TusdcChip }) {
  const label = !chip.connected
    ? "—"
    : chip.loading && chip.balance === null
      ? "…"
      : (chip.balance ?? "—");

  return (
    <Link
      href="/faucet"
      aria-label={
        chip.connected && chip.balance !== null
          ? `Available test USDC ${chip.balance}. Open faucet.`
          : "Available test USDC. Open faucet."
      }
      className="radius-control inline-flex max-w-[min(100%,14rem)] shrink-0 items-center gap-2 border border-brand-muted/80 bg-brand-mist px-3 py-2 text-left shadow-soft transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Get more test USDC from the faucet"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-brand-muted/70 bg-brand-soft text-brand-ink">
        <Droplets className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Available tUSDC
        </span>
        <span className="block truncate text-sm font-semibold tabular-nums text-foreground">
          {label}
        </span>
      </span>
    </Link>
  );
}
