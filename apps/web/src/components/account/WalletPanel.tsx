"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
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
import { formatStockAmount } from "@/lib/stocks";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";

export function WalletPanel({
  me,
  onChanged,
}: {
  me: MeResponse | null;
  onChanged: () => void;
}) {
  const wallet = useWispWallet();
  const [tusdc, setTusdc] = useState<string>("—");
  const [stocks, setStocks] = useState<string[]>([]);
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
        setTusdc(`${formatUsdcRaw(bal)} tUSDC`);
        const lines: string[] = [];
        for (const asset of manifest.assets) {
          const raw = await publicClient.readContract({
            address: asset.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          if (raw > 0n) lines.push(`${formatStockAmount(raw)} ${asset.symbol}`);
        }
        setStocks(lines);
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
        <p className="text-sm font-medium">
          {display ? shortenAddress(display, 6) : "No wallet yet"}
        </p>
        {display ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(display);
                toast.success(TOAST.copied);
              }}
            >
              Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              href={baseScanAddress(display)}
              target="_blank"
              rel="noreferrer"
            >
              BaseScan
            </Button>
          </div>
        ) : null}
        <div className="text-sm text-muted-foreground">
          <p>tUSDC: {tusdc}</p>
          <p>Stocks: {stocks.length ? stocks.join(", ") : "none"}</p>
          <p>
            Binding:{" "}
            {boundMatchesDisplay
              ? "verified"
              : bound
                ? "outdated — re-verify smart wallet"
                : "not linked"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={linking} onClick={() => void ensureAndLink()}>
            {linking
              ? "Linking…"
              : boundMatchesDisplay
                ? "Re-verify wallet"
                : bound
                  ? "Link smart wallet"
                  : "Create / link wallet"}
          </Button>
          <Button href="/faucet" variant="secondary">
            Get test USDC
          </Button>
        </div>
      </div>
    </section>
  );
}
