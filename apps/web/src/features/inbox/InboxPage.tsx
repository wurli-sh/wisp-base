"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { encodeFunctionData } from "viem";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { SignInAuthPanel } from "@/components/SignInAuthPanel";
import { StockIcon } from "@/components/StockIcon";
import { Button } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { InboxTableRowsSkeleton, InboxMobileRowsSkeleton } from "@/components/ui/Skeleton";
import { apiFetch, toInboxItem, uniqueByGiftId, type ApiGift, type InboxItem } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth";
import { baseScanTx, formatStockAmount, formatUsdcRaw } from "@/lib/format/amount";
import { stockBySymbol, STOCKS } from "@/lib/stocks";
import { contractAddresses, escrowAbi, loadDeployment, publicClient } from "@/lib/chain";
import { userFacingError } from "@/lib/errors";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";

type Tab = "incoming" | "sent" | "history";

export function InboxPage() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = (search.get("tab") as Tab) || "incoming";
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken();
      setSignedIn(Boolean(token));
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const [incoming, sent, manifest] = await Promise.all([
          apiFetch<{ items: ApiGift[] }>("/v1/inbox", { token }),
          apiFetch<{ gifts: ApiGift[] }>("/v1/gifts", { token }),
          loadDeployment(),
        ]);
        const symbolFor = (address: string) => manifest.assets.find((asset) => asset.address.toLowerCase() === address.toLowerCase())?.symbol;
        setItems([
          ...incoming.items.map((gift) => toInboxItem(gift, "incoming", symbolFor(gift.tokenAddress))),
          ...sent.gifts.map((gift) => toInboxItem(gift, "sent", symbolFor(gift.tokenAddress))),
        ]);
      } catch (error) {
        setItems([]);
        toast.error(userFacingError(error, "Could not load Inbox"), { id: "inbox-load" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const visible = items.filter((item) => {
      const terminal = ["claimed", "refunded", "failed"].includes(item.status);
      if (tab === "history") return terminal;
      if (tab === "sent") return item.direction === "sent" && !terminal;
      return item.direction === "incoming" && !terminal;
    });
    return tab === "history" ? uniqueByGiftId(visible) : visible;
  }, [items, tab]);

  if (!signedIn) {
    return (
      <PageShell title="Inbox" subtitle="Sign in to see gifts sent to you." maxWidth="md">
        <SignInAuthPanel redirectNext="/inbox" onAuthenticated={() => setSignedIn(true)} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Inbox"
      subtitle="Incoming, sent, and history for Wisp test stock gifts."
      maxWidth="xl"
    >
      <div className="mb-6 flex justify-center">
        <SegmentedTabs
          layoutId="inbox-sections"
          ariaLabel="Inbox sections"
          value={tab}
          onValueChange={(next) => router.replace(`/inbox?tab=${next}`)}
          items={[
            { value: "incoming", label: "Incoming" },
            { value: "sent", label: "Sent" },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      <div className="radius-surface overflow-hidden border border-border/80 bg-card shadow-card">
        {loading ? (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <tbody>
                  <InboxTableRowsSkeleton columns={5} />
                </tbody>
              </table>
            </div>
            <ul className="md:hidden">
              <InboxMobileRowsSkeleton />
            </ul>
          </>
        ) : filtered.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">No gifts yet.</p>
            <Button href="/send" variant="secondary">
              Send a gift
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[24%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="border-b border-border/60 bg-brand-mist/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Stock</th>
                    <th className="px-4 py-2.5">From / To</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Dates</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((item) => (
                    <GiftRow key={item.id} item={item} desktop onRefunded={markRefunded} />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border/50 md:hidden">
              {filtered.map((item) => (
                <GiftRow key={item.id} item={item} onRefunded={markRefunded} />
              ))}
            </ul>
          </>
        )}
      </div>
    </PageShell>
  );

  function markRefunded(id: string, hash: string) {
    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, status: "refunded", refundedTxHash: hash } : item
    )));
  }
}

function GiftRow({ item, desktop, onRefunded }: { item: InboxItem; desktop?: boolean; onRefunded: (id: string, hash: string) => void }) {
  const stock =
    stockBySymbol(item.tokenSymbol ?? "") ??
    STOCKS.find((s) => s.key === "WISPAAPL")!;
  const sender = item.direction === "sent"
    ? "Recipient"
    : item.anonymousSender ? "Anonymous gift" : item.senderDisplayName ?? "Someone";
  const claimHref = `/send?tab=claim&gift=${item.id}`;

  if (desktop) {
    return (
      <tr className="align-middle">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <StockIcon stock={stock} size="sm" />
            <div className="min-w-0">
              <p className="font-semibold">{formatRawStock(item.stockAmount)} {stock.symbol}</p>
              <p className="text-xs text-muted-foreground">~${formatRawUsdc(item.usdcAmount)} at send</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm">{sender}</td>
        <td className="px-4 py-3">
          <StatusPill status={item.status} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {item.unlockAt ? `Unlock ${new Date(item.unlockAt).toLocaleString()}` : "—"}
        </td>
        <td className="px-4 py-3 text-right">
          <RowActions item={item} claimHref={claimHref} onRefunded={onRefunded} />
        </td>
      </tr>
    );
  }

  return (
    <li className="list-none space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StockIcon stock={stock} size="sm" />
          <span className="font-semibold">
            {formatRawStock(item.stockAmount)} {stock.symbol}
          </span>
        </div>
        <StatusPill status={item.status} />
      </div>
      <p className="text-sm text-muted-foreground">{sender}</p>
      {item.message ? <p className="text-sm">{item.message}</p> : null}
      <RowActions item={item} claimHref={claimHref} onRefunded={onRefunded} />
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="radius-control inline-flex bg-selection px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-selection-foreground">
      {status}
    </span>
  );
}

function formatRawStock(value?: string) {
  try { return value ? formatStockAmount(BigInt(value)) : "—"; } catch { return "—"; }
}

function formatRawUsdc(value?: string) {
  try { return value ? formatUsdcRaw(BigInt(value)) : "—"; } catch { return "—"; }
}

function RowActions({ item, claimHref, onRefunded }: { item: InboxItem; claimHref: string; onRefunded: (id: string, hash: string) => void }) {
  const wallet = useWispWallet();
  const [refunding, setRefunding] = useState(false);

  async function refund() {
    if (!item.onchainGiftId) return;
    setRefunding(true);
    try {
      const address = await ensureBoundWallet(wallet);
      const manifest = await loadDeployment();
      const { giftEscrow } = contractAddresses(manifest);
      const onchainId = BigInt(item.onchainGiftId);
      await publicClient.simulateContract({ address: giftEscrow, abi: escrowAbi, functionName: "refund", args: [onchainId], account: address });
      const data = encodeFunctionData({ abi: escrowAbi, functionName: "refund", args: [onchainId] });
      const hash = await wallet.sendTransaction({ to: giftEscrow, data });
      await wallet.waitForReceipt(hash);
      onRefunded(item.id, hash);
      toast.success("Refund confirmed on Base");
    } catch (error) {
      toast.error(userFacingError(error, "Refund failed"));
    } finally {
      setRefunding(false);
    }
  }
  return (
    <div className="inline-flex flex-wrap items-center justify-start gap-x-3 gap-y-2 md:flex-nowrap md:justify-end">
      {item.fundedTxHash ? (
        <a
          className="inline-flex h-8 shrink-0 items-center text-xs font-semibold leading-none text-brand underline underline-offset-2"
          href={baseScanTx(item.fundedTxHash)}
          target="_blank"
          rel="noreferrer"
        >
          BaseScan
        </a>
      ) : null}
      {item.direction === "incoming" && ["funded", "delivered", "claimable", "locked"].includes(item.status) ? (
        <Button href={claimHref} size="sm" className="!min-h-8 h-8 shrink-0 px-3 py-0">
          Claim
        </Button>
      ) : null}
      {item.direction === "sent" && item.status === "refundable" ? (
        <Button
          size="sm"
          variant="secondary"
          className="!min-h-8 h-8 shrink-0 px-3 py-0"
          disabled={refunding}
          onClick={() => void refund()}
        >
          {refunding ? "Refunding…" : "Refund"}
        </Button>
      ) : null}
      <Link
        href={`/claim?gift=${item.id}`}
        className="inline-flex h-8 shrink-0 items-center text-xs font-semibold leading-none text-muted-foreground underline underline-offset-2"
      >
        View
      </Link>
    </div>
  );
}
