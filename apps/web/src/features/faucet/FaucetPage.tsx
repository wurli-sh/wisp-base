"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Droplets,
  ExternalLink,
  Fuel,
  Gauge,
  Link2Off,
} from "lucide-react";
import { encodeFunctionData, type Hash } from "viem";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { Button } from "@/components/ui/Button";
import { getAccessToken } from "@/lib/auth";
import { TOAST } from "@/lib/brand-copy";
import {
  contractAddresses,
  loadDeployment,
  mockUsdcAbi,
  publicClient,
} from "@/lib/chain";
import { userFacingError } from "@/lib/errors";
import { baseScanTx, formatUsdcRaw, shortenAddress } from "@/lib/format/amount";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";

const CHIPS = [10, 25, 50, 100] as const;

type MintPhase =
  | "idle"
  | "preparing_wallet"
  | "submitting"
  | "confirming"
  | "refreshing";

export function FaucetPage() {
  const wallet = useWispWallet();
  const [signedIn, setSignedIn] = useState(false);
  const [amountUsd, setAmountUsd] = useState(25);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [faucetMax, setFaucetMax] = useState<bigint>(1_000_000_000n);
  const [readyAt, setReadyAt] = useState<number>(0);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const mintingRef = useRef(false);
  const busy = phase !== "idle";

  useEffect(() => {
    void getAccessToken().then((tok) => setSignedIn(Boolean(tok)));
  }, []);

  useEffect(() => {
    if (!wallet.address) return;
    void refreshBalances(wallet.address).catch((error) => {
      toast.error(userFacingError(error, "Could not load faucet balances"), { id: "faucet-balances" });
    });
  }, [wallet.address]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshBalances(address: `0x${string}`) {
    const manifest = await loadDeployment();
    const { mockUsdc } = contractAddresses(manifest);
    const [bal, max, cooldown, eth] = await Promise.all([
      publicClient.readContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "balanceOf",
        args: [address],
      }),
      publicClient.readContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "faucetMax",
      }),
      publicClient.readContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "faucetCooldown",
        args: [address],
      }),
      publicClient.getBalance({ address }),
    ]);
    setBalance(bal);
    setFaucetMax(max);
    setReadyAt(Number(cooldown));
    setEthBalance(eth);
  }

  async function mint() {
    if (mintingRef.current) return;
    mintingRef.current = true;
    setPhase("preparing_wallet");
    try {
      const address = await ensureBoundWallet(wallet);
      const manifest = await loadDeployment();
      const { mockUsdc } = contractAddresses(manifest);
      const amount = BigInt(amountUsd) * 1_000_000n;
      if (amount > faucetMax) throw new Error("faucet_amount_too_high");
      if (readyAt && Date.now() / 1000 < readyAt) throw new Error("faucet_cooldown");

      const data = encodeFunctionData({
        abi: mockUsdcAbi,
        functionName: "faucet",
        args: [address, amount],
      });
      setPhase("submitting");
      await publicClient.simulateContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "faucet",
        args: [address, amount],
        account: address,
      });
      const hash = await wallet.sendTransaction({ to: mockUsdc, data });
      setPhase("confirming");
      await wallet.waitForReceipt(hash);
      setTxHash(hash);
      setPhase("refreshing");
      await refreshBalances(address);
      toast.success(TOAST.faucetMinted);
    } catch (e) {
      console.error("[faucet] mint failed", e);
      toast.error(userFacingError(e, "Faucet mint failed"));
    } finally {
      mintingRef.current = false;
      setPhase("idle");
    }
  }

  if (!signedIn) {
    return (
      <PageShell title="Faucet" subtitle="Sign in to mint test USDC for Send demos.">
        <SignInAuthPanel redirectNext="/faucet" onAuthenticated={() => setSignedIn(true)} />
      </PageShell>
    );
  }

  const cooldownLeft = Math.max(0, readyAt - nowSeconds);
  const maxUsd = Number(faucetMax / 1_000_000n);
  const connected = Boolean(wallet.address);
  const ethLabel =
    ethBalance !== null && ethBalance > 0n
      ? Number(ethBalance) / 1e18 < 0.0001
        ? "<0.0001 ETH"
        : `${(Number(ethBalance) / 1e18).toFixed(4)} ETH`
      : null;

  return (
    <PageShell
      title="Faucet"
      subtitle="Mint tUSDC on Base Sepolia. TEST ASSET — NOT REAL USDC."
    >
      <div className="radius-surface overflow-hidden border border-border/80 bg-card shadow-card">
        <div className="flex items-start gap-3 border-b border-brand-muted/70 bg-brand-mist px-5 py-4 sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-muted bg-brand-soft text-brand-ink">
            <Droplets className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Test USDC faucet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mint demo funds for Send. Not real USDC — gas sponsored via CDP Paymaster when enabled.
            </p>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <ul className="space-y-2.5">
            <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
              {connected ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/chains/base.svg" alt="" className="size-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Wallet
                    </p>
                    <p className="truncate font-mono text-sm font-semibold text-foreground">
                      {shortenAddress(wallet.address!, 6)}
                    </p>
                  </div>
                  <span className="radius-control inline-flex items-center gap-1 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                    Linked
                  </span>
                </>
              ) : (
                <>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <Link2Off className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Wallet
                    </p>
                    <p className="text-sm font-semibold text-foreground">Not connected</p>
                  </div>
                  <span className="radius-control inline-flex items-center bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Required
                  </span>
                </>
              )}
            </li>

            <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-muted/70 bg-brand-mist text-brand-ink">
                <Droplets className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Balance
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {balance === null ? "—" : `${formatUsdcRaw(balance)} tUSDC`}
                </p>
              </div>
            </li>

            <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-muted/70 bg-brand-mist text-brand-ink">
                <Fuel className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Gas
                </p>
                <p className="text-sm font-semibold text-foreground">Sponsored · CDP Paymaster</p>
                {ethLabel ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Wallet also holds {ethLabel}</p>
                ) : null}
              </div>
            </li>

            <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-muted/70 bg-brand-mist text-brand-ink">
                {cooldownLeft > 0 ? (
                  <Clock3 className="h-4 w-4" aria-hidden />
                ) : (
                  <Gauge className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Limits
                </p>
                <p className="text-sm font-semibold text-foreground">
                  Max {formatUsdcRaw(faucetMax)} tUSDC per mint
                </p>
              </div>
              {cooldownLeft > 0 ? (
                <span className="radius-control inline-flex items-center gap-1 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">
                  <Clock3 className="h-3 w-3" aria-hidden />
                  {cooldownLeft}s
                </span>
              ) : (
                <span className="radius-control inline-flex items-center bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                  Ready
                </span>
              )}
            </li>
          </ul>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Amount</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmountUsd(chip)}
                  className={`radius-control min-h-11 text-sm font-semibold transition-colors ${
                    amountUsd === chip
                      ? "border border-brand-dark bg-gradient-to-b from-[#4788f5] to-brand text-brand-foreground shadow-action"
                      : "border border-border bg-card hover:bg-muted"
                  }`}
                >
                  ${chip}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label htmlFor="faucet-amount" className="text-sm font-medium">
                Custom amount
              </label>
              <div className="radius-surface-inner flex h-11 items-center border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
                <span className="text-muted-foreground">$</span>
                <input
                  id="faucet-amount"
                  inputMode="numeric"
                  min={1}
                  max={maxUsd}
                  value={amountUsd}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value || "0", 10);
                    setAmountUsd(Math.max(1, Math.min(maxUsd, Number.isFinite(next) ? next : 1)));
                  }}
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              data-testid="faucet-mint"
              className="w-full"
              disabled={busy || cooldownLeft > 0}
              onClick={() => void mint()}
            >
              {busy ? (
                mintButtonLabel(phase)
              ) : (
                <>
                  <Droplets className="h-4 w-4" aria-hidden />
                  Mint test USDC
                </>
              )}
            </Button>

            {txHash ? (
              <Button
                href={baseScanTx(txHash)}
                target="_blank"
                rel="noreferrer"
                variant="outline"
                className="w-full"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                View mint on BaseScan
              </Button>
            ) : null}

            <Button href="/send" variant="secondary" className="w-full">
              Continue to Send
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function mintButtonLabel(phase: MintPhase): string {
  switch (phase) {
    case "preparing_wallet":
      return "Preparing wallet…";
    case "submitting":
      return "Submitting mint…";
    case "confirming":
      return "Confirming on Base…";
    case "refreshing":
      return "Updating balance…";
    case "idle":
      return "Mint test USDC";
  }
}
