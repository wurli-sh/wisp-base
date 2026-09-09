"use client";

import { useEffect, useRef, useState } from "react";
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

export function FaucetPage() {
  const wallet = useWispWallet();
  const [signedIn, setSignedIn] = useState(false);
  const [amountUsd, setAmountUsd] = useState(25);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [faucetMax, setFaucetMax] = useState<bigint>(1_000_000_000n);
  const [readyAt, setReadyAt] = useState<number>(0);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const mintingRef = useRef(false);

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
    setBusy(true);
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
      await publicClient.simulateContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "faucet",
        args: [address, amount],
        account: address,
      });
      const hash = await wallet.sendTransaction({ to: mockUsdc, data });
      await wallet.waitForReceipt(hash);
      setTxHash(hash);
      await refreshBalances(address);
      toast.success(TOAST.faucetMinted);
    } catch (e) {
      console.error("[faucet] mint failed", e);
      toast.error(userFacingError(e, "Faucet mint failed"));
    } finally {
      mintingRef.current = false;
      setBusy(false);
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

  return (
    <PageShell
      title="Faucet"
      subtitle="Mint tUSDC on Base Sepolia. TEST ASSET — NOT REAL USDC."
    >
      <div className="radius-surface space-y-5 border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="rounded-md border border-brand-muted bg-brand-mist px-3 py-2 text-sm text-brand-ink">
          TEST ASSET — NOT REAL USDC. Gas is sponsored via CDP Paymaster when Paymaster is enabled in the Portal.
        </div>

        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">Wallet</p>
          <p className="font-medium">
            {wallet.address ? shortenAddress(wallet.address, 6) : "Not connected"}
          </p>
          <p className="text-muted-foreground">
            Balance: {balance === null ? "—" : `${formatUsdcRaw(balance)} tUSDC`}
          </p>
          <p className="text-muted-foreground">
            Gas: sponsored (CDP Paymaster)
            {ethBalance !== null && ethBalance > 0n
              ? ` · wallet also holds ${Number(ethBalance) / 1e18 < 0.0001 ? "<0.0001" : (Number(ethBalance) / 1e18).toFixed(4)} ETH`
              : ""}
          </p>
          <p className="text-muted-foreground">
            Max per mint: {formatUsdcRaw(faucetMax)} tUSDC
            {cooldownLeft > 0 ? ` · cooldown ${cooldownLeft}s` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setAmountUsd(chip)}
              className={`radius-control min-h-11 text-sm font-semibold ${
                amountUsd === chip
                  ? "border border-brand-dark bg-gradient-to-b from-[#4788f5] to-brand text-brand-foreground shadow-action"
                  : "border border-border bg-card"
              }`}
            >
              ${chip}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="faucet-amount" className="text-sm font-medium">Custom amount</label>
          <div className="flex h-11 items-center rounded-md border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
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

        <Button
          data-testid="faucet-mint"
          className="w-full"
          disabled={busy || cooldownLeft > 0}
          onClick={() => void mint()}
        >
          Mint test USDC
        </Button>

        {txHash ? (
          <p className="text-sm">
            Success.{" "}
            <a className="font-semibold text-brand underline" href={baseScanTx(txHash)} target="_blank" rel="noreferrer">
              View on BaseScan
            </a>
          </p>
        ) : null}

        <Button href="/send" variant="secondary" className="w-full">
          Continue to Send
        </Button>
      </div>
    </PageShell>
  );
}
