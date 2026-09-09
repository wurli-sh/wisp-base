"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { baseScanAddress, baseScanTx } from "@/lib/format/amount";

type Manifest = {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
  assets: Array<{ symbol: string; address: string }>;
  transactions?: { deploy?: string[]; seedInventory?: string };
};

export default function MainnetDemoPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    void fetch("/deployments/base-sepolia.json")
      .then((r) => r.json())
      .then((data: Manifest) => setManifest(data))
      .catch(() => setManifest(null));
  }, []);

  return (
    <PageShell
      title="Base Sepolia demo evidence"
      subtitle="Mainnet is not deployed. These links are testnet contracts and smoke transactions."
    >
      <div className="radius-surface space-y-4 border border-border bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground">
          Demo tokens are Wisp-created test assets — not real Coinbase Tokenized Stocks.
        </p>
        {manifest ? (
          <>
            <p className="text-sm font-medium">
              {manifest.network} · chain {manifest.chainId}
            </p>
            {Object.entries(manifest.contracts).map(([key, address]) => (
              <p key={key} className="text-sm">
                {key}:{" "}
                <a className="text-brand underline" href={baseScanAddress(address)} target="_blank" rel="noreferrer">
                  {address}
                </a>
              </p>
            ))}
            {manifest.assets.map((asset) => (
              <p key={asset.symbol} className="text-sm">
                {asset.symbol}:{" "}
                <a className="text-brand underline" href={baseScanAddress(asset.address)} target="_blank" rel="noreferrer">
                  {asset.address}
                </a>
              </p>
            ))}
            {manifest.transactions?.seedInventory ? (
              <p className="text-sm">
                Seed inventory:{" "}
                <a
                  className="text-brand underline"
                  href={baseScanTx(manifest.transactions.seedInventory)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {manifest.transactions.seedInventory.slice(0, 14)}…
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading evidence…</p>
        )}
      </div>
    </PageShell>
  );
}
