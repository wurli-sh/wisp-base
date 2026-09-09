"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, type Hash } from "viem";
import { toast } from "sonner";
import { GiftCard } from "@/components/GiftCard";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { Button } from "@/components/ui/Button";
import { ClaimPageSkeleton } from "@/components/ui/Skeleton";
import { apiFetch, type ApiGift } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth";
import {
  contractAddresses,
  escrowAbi,
  loadDeployment,
  publicClient,
} from "@/lib/chain";
import { userFacingError } from "@/lib/errors";
import { baseScanTx, formatStockAmount, formatUsdcRaw } from "@/lib/format/amount";
import { stockByKey, STOCKS, type StockMeta } from "@/lib/stocks";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";
import { celebrateClaim } from "@/features/claim/celebrateClaim";

type Props = {
  giftId?: string;
  embedded?: boolean;
};

export function ClaimView({ giftId, embedded }: Props) {
  const wallet = useWispWallet();
  const [signedIn, setSignedIn] = useState(false);
  const [gift, setGift] = useState<ApiGift | null>(null);
  const [role, setRole] = useState<"sender" | "recipient" | "both">("recipient");
  const [stock, setStock] = useState<StockMeta>(STOCKS[0]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [done, setDone] = useState(false);
  const [completion, setCompletion] = useState<"claimed" | "refunded" | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const operationRef = useRef(false);
  useEffect(() => {
    void (async () => {
      const token = await getAccessToken();
      setSignedIn(Boolean(token));
      if (!token || !giftId) return;
      try {
        const data = await apiFetch<{ role: "sender" | "recipient" | "both"; gift: ApiGift }>(`/v1/gifts/${giftId}`, { token });
        setGift(data.gift);
        setRole(data.role);
        if (data.role === "recipient" || data.role === "both") {
          void apiFetch(`/v1/gifts/${giftId}/read`, { token, method: "POST" }).catch((error) => {
            toast.error(userFacingError(error, "Could not mark gift as read"), { id: "gift-read" });
          });
        }
        const manifest = await loadDeployment();
        const asset = manifest.assets.find((entry) => entry.address.toLowerCase() === data.gift.tokenAddress.toLowerCase());
        if (asset) setStock(stockByKey(asset.key) ?? STOCKS[0]);
      } catch (e) {
        setLoadFailed(true);
        toast.error(userFacingError(e, "Gift not found"), { id: "claim-load" });
      }
    })();
  }, [giftId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function claim() {
    if (!giftId || !gift || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("unauthorized");
      const address = await ensureBoundWallet(wallet);
      const manifest = await loadDeployment();
      const { giftEscrow } = contractAddresses(manifest);
      let hash: Hash | null = null;
      for (let attempt = 0; attempt < 2 && !hash; attempt += 1) {
        const auth = await apiFetch<{ giftId: string; deadline: number; signature: string }>(
          `/v1/gifts/${giftId}/claim-authorization`,
          { token, method: "POST" },
        );
        const onchainId = BigInt(auth.giftId);
        const deadline = BigInt(auth.deadline);
        const signature = auth.signature as `0x${string}`;
        const onchain = await publicClient.readContract({
          address: giftEscrow,
          abi: escrowAbi,
          functionName: "getGift",
          args: [onchainId],
        });
        if (
          onchain[0].toLowerCase() !== gift.tokenAddress.toLowerCase() ||
          onchain[2].toString() !== gift.tokenAmount ||
          Number(onchain[3]) !== Math.floor(Date.parse(gift.unlockAt) / 1000) ||
          Number(onchain[4]) !== Math.floor(Date.parse(gift.expiresAt) / 1000) ||
          Number(onchain[5]) !== 1
        ) throw new Error("claim_authorization_invalid");
        if (Number(onchain[3]) > Math.floor(Date.now() / 1000)) throw new Error("gift_locked");
        if (Number(onchain[4]) <= Math.floor(Date.now() / 1000)) throw new Error("gift_expired");
        try {
          await publicClient.simulateContract({ address: giftEscrow, abi: escrowAbi, functionName: "claim", args: [onchainId, address, deadline, signature], account: address });
          const data = encodeFunctionData({ abi: escrowAbi, functionName: "claim", args: [onchainId, address, deadline, signature] });
          hash = await wallet.sendTransaction({ to: giftEscrow, data });
        } catch (error) {
          if (attempt === 0 && /expired|deadline/i.test(error instanceof Error ? error.message : String(error))) continue;
          throw error;
        }
      }
      if (!hash) throw new Error("claim_authorization_expired");
      await wallet.waitForReceipt(hash);
      setTxHash(hash);
      let indexed = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const projection = await apiFetch<{ gift: ApiGift }>(`/v1/gifts/${giftId}`, { token });
        if (projection.gift.state === "claimed") {
          setGift(projection.gift);
          indexed = true;
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
      setDone(true);
      setCompletion("claimed");
      celebrateClaim();
      if (indexed) toast.success("Gift claimed");
      else toast.info("Claim confirmed on Base; Inbox is still syncing", { id: "claim-indexing" });
    } catch (e) {
      toast.error(userFacingError(e, "Claim failed"));
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }

  async function refund() {
    if (!gift?.onchainGiftId || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    try {
      const address = await ensureBoundWallet(wallet);
      const manifest = await loadDeployment();
      const { giftEscrow } = contractAddresses(manifest);
      const onchainId = BigInt(gift.onchainGiftId);
      await publicClient.simulateContract({ address: giftEscrow, abi: escrowAbi, functionName: "refund", args: [onchainId], account: address });
      const data = encodeFunctionData({ abi: escrowAbi, functionName: "refund", args: [onchainId] });
      const hash = await wallet.sendTransaction({ to: giftEscrow, data });
      await wallet.waitForReceipt(hash);
      setTxHash(hash);
      const token = await getAccessToken();
      if (token) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const projection = await apiFetch<{ gift: ApiGift }>(`/v1/gifts/${gift.id}`, { token });
          if (projection.gift.state === "refunded") {
            setGift(projection.gift);
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        }
      }
      setDone(true);
      setCompletion("refunded");
      toast.success("Refund confirmed on Base");
    } catch (error) {
      toast.error(userFacingError(error, "Refund failed"));
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }

  if (!signedIn) {
    return <SignInAuthPanel redirectNext={giftId ? `/claim?gift=${giftId}` : "/claim"} />;
  }

  if (!giftId) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Pick a gift from Inbox to claim.</p>
        <Button href="/inbox">Open Inbox</Button>
      </div>
    );
  }

  if (loadFailed) {
    return <div className="space-y-3 text-center"><Button href="/inbox" variant="secondary">Back to Inbox</Button></div>;
  }

  if (!gift) return <ClaimPageSkeleton />;

  const unlockMs = new Date(gift.unlockAt).getTime();
  const locked = unlockMs > now;
  const expired = new Date(gift.expiresAt).getTime() <= now;
  const canReceive = role === "recipient" || role === "both";
  const canRefund = role === "sender" || role === "both";
  const claimable = canReceive
    && !expired
    && ["funded", "delivered", "claimable"].includes(gift.state);
  const sender = gift.anonymousSender ? "Anonymous gift" : gift.senderDisplayName ?? "Someone";

  return (
    <div className="space-y-6">
      <GiftCard
        stock={stock}
        amountLabel={formatStockAmount(BigInt(gift.tokenAmount))}
        usdLabel={`$${formatUsdcRaw(BigInt(gift.usdcAmount))}`}
        senderLabel={sender}
        message={gift.message}
        status={completion ?? (locked ? "locked" : gift.state)}
        footer={
          <div className="flex flex-col gap-2">
            {!done && claimable ? (
              <>
                <Button
                  data-testid="claim-gift"
                  className="w-full"
                  disabled={busy || Boolean(locked)}
                  onClick={() => void claim()}
                >
                  {locked ? `Unlocks in ${formatCountdown(unlockMs - now)}` : busy ? "Claiming…" : "Claim to wallet"}
                </Button>
              </>
            ) : !done && canRefund && gift.state === "refundable" ? (
              <Button className="w-full" disabled={busy} onClick={() => void refund()}>
                {busy ? "Refunding…" : "Refund to sender wallet"}
              </Button>
            ) : done ? (
              <>
                {canReceive && completion !== "refunded" ? <Button href="/account?tab=wallet" className="w-full">View in wallet</Button> : null}
                {txHash ? (
                  <Button href={baseScanTx(txHash)} target="_blank" rel="noreferrer" variant="secondary" className="w-full">
                    View on BaseScan
                  </Button>
                ) : null}
                {!embedded ? (
                  <Button href="/inbox" variant="outline" className="w-full">
                    Back to Inbox
                  </Button>
                ) : (
                  <Link href="/inbox" className="text-center text-sm font-semibold text-brand underline">
                    Back to Inbox
                  </Link>
                )}
              </>
            ) : <Button href="/inbox" variant="secondary" className="w-full">Back to Inbox</Button>}
          </div>
        }
      />
      {wallet.address ? (
        <p className="text-center text-xs text-muted-foreground">
          Destination: {wallet.address}
        </p>
      ) : null}
    </div>
  );
}

function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}
