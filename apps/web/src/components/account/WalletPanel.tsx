"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Copy,
  Droplets,
  ExternalLink,
  Link2,
  ShieldAlert,
  ShieldOff,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { StockIcon } from "@/components/StockIcon";
import { Button } from "@/components/ui/Button";
import type { MeResponse } from "@/lib/auth";
import { TOAST } from "@/lib/brand-copy";
import {
  contractAddresses,
  erc20Abi,
  loadDeployment,
  mockUsdcAbi,
  publicClient,
} from "@/lib/chain";
import { userFacingError } from "@/lib/errors";
import { baseScanAddress, formatUsdcRaw, shortenAddress } from "@/lib/format/amount";
import {
  formatStockAmount,
  stockByKey,
  type StockMeta,
} from "@/lib/stocks";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";

type StockHolding = {
  key: string;
  symbol: string;
  amount: string;
  meta?: StockMeta;
};

export function WalletPanel({
  me,
  onChanged,
}: {
  me: MeResponse | null;
  onChanged: () => void;
}) {
  const wallet = useWispWallet();
  const [tusdc, setTusdc] = useState<string>("—");
  const [stocks, setStocks] = useState<StockHolding[]>([]);
  const [linking, setLinking] = useState(false);
  const bound = me?.wallet?.address ?? null;

  useEffect(() => {
    const address = (wallet.address ?? bound) as `0x${string}` | null;
    if (!address) return;
    void (async () => {
      try {
        const manifest = await loadDeployment();
        const { mockUsdc } = contractAddresses(manifest);
        const bal = await publicClient.readContract({
          address: mockUsdc,
          abi: mockUsdcAbi,
          functionName: "balanceOf",
          args: [address],
        });
        setTusdc(formatUsdcRaw(bal));
        const holdings: StockHolding[] = [];
        for (const asset of manifest.assets) {
          const raw = await publicClient.readContract({
            address: asset.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          if (raw > 0n) {
            holdings.push({
              key: asset.key,
              symbol: asset.symbol,
              amount: formatStockAmount(raw),
              meta: stockByKey(asset.key),
            });
          }
        }
        setStocks(holdings);
      } catch (error) {
        toast.error(userFacingError(error, "Could not load wallet balances"), {
          id: "wallet-balances",
        });
      }
    })();
  }, [wallet.address, bound]);

  async function ensureAndLink() {
    setLinking(true);
    try {
      await ensureBoundWallet(wallet);
      toast.success(TOAST.walletLinked);
      onChanged();
    } catch (e) {
      toast.error(userFacingError(e, "Could not link wallet"));
    } finally {
      setLinking(false);
    }
  }

  const display = wallet.address ?? bound;
  const boundMatchesDisplay = Boolean(
    bound && wallet.address && bound.toLowerCase() === wallet.address.toLowerCase(),
  );
  const binding = boundMatchesDisplay
    ? ("verified" as const)
    : bound
      ? ("outdated" as const)
      : ("unlinked" as const);

  return (
    <section className="radius-surface overflow-hidden border border-border/80 bg-card shadow-card">
      <div className="flex items-start gap-3 border-b border-brand-muted/70 bg-brand-mist px-5 py-4 sm:px-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-muted bg-brand-soft text-brand-ink">
          <Wallet className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Embedded Base wallet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            CDP smart wallet on Base Sepolia (gas sponsored). Binding is required before claim.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {display ? (
          <div className="radius-surface-inner flex items-center gap-3 border border-border/70 bg-muted/40 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chains/base.svg"
              alt=""
              className="size-8 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Address
              </p>
              <p className="truncate font-mono text-sm font-semibold text-foreground">
                {shortenAddress(display, 6)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                aria-label="Copy wallet address"
                onClick={() => {
                  void navigator.clipboard.writeText(display);
                  toast.success(TOAST.copied);
                }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                href={baseScanAddress(display)}
                target="_blank"
                rel="noreferrer"
                aria-label="View wallet on BaseScan"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                BaseScan
              </Button>
            </div>
          </div>
        ) : (
          <p className="radius-surface-inner border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No wallet yet — create or link one to claim gifts.
          </p>
        )}

        <ul className="space-y-2.5">
          <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-muted/70 bg-brand-mist text-brand-ink">
              <Droplets className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Test USDC
              </p>
              <p className="text-sm font-semibold text-foreground">
                {display ? `${tusdc} tUSDC` : "—"}
              </p>
            </div>
          </li>

          <li className="radius-surface-inner border border-border/70 px-4 py-3">
            <div className="mb-2.5 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Test stocks
              </p>
            </div>
            {stocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {display ? "No stock holdings yet" : "—"}
              </p>
            ) : (
              <ul className="space-y-2">
                {stocks.map((holding) => (
                  <li key={holding.key} className="flex items-center gap-3">
                    {holding.meta ? (
                      <StockIcon stock={holding.meta} size="sm" />
                    ) : (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                        {holding.symbol.slice(1, 2) || "?"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {holding.symbol}
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {holding.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>

          <li className="radius-surface-inner flex items-center gap-3 border border-border/70 px-4 py-3">
            <BindingBadge status={binding} />
          </li>
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button disabled={linking} onClick={() => void ensureAndLink()}>
            {linking ? (
              "Linking…"
            ) : boundMatchesDisplay ? (
              <>
                <BadgeCheck className="h-4 w-4" aria-hidden />
                Re-verify wallet
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" aria-hidden />
                {bound ? "Link smart wallet" : "Create / link wallet"}
              </>
            )}
          </Button>
          <Button href="/faucet" variant="secondary">
            <Droplets className="h-4 w-4" aria-hidden />
            Get test USDC
          </Button>
        </div>
      </div>
    </section>
  );
}

function BindingBadge({ status }: { status: "verified" | "outdated" | "unlinked" }) {
  if (status === "verified") {
    return (
      <>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700">
          <BadgeCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Binding
          </p>
          <p className="text-sm font-semibold text-emerald-700">Verified</p>
        </div>
        <span className="radius-control inline-flex items-center gap-1 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
          Ready
        </span>
      </>
    );
  }

  if (status === "outdated") {
    return (
      <>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700">
          <ShieldAlert className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Binding
          </p>
          <p className="text-sm font-semibold text-amber-800">Outdated</p>
        </div>
        <span className="radius-control inline-flex max-w-[9rem] items-center bg-amber-500/15 px-2.5 py-1 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-amber-900">
          Re-verify
        </span>
      </>
    );
  }

  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
        <ShieldOff className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Binding
        </p>
        <p className="text-sm font-semibold text-foreground">Not linked</p>
      </div>
      <span className="radius-control inline-flex items-center bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Required
      </span>
    </>
  );
}
