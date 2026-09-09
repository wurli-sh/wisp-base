"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { apiFetch, type ConfigResponse, type HealthResponse } from "@/lib/api/client";
import { baseScanAddress } from "@/lib/format/amount";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors";

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [h, c] = await Promise.all([
          apiFetch<HealthResponse>("/v1/health"),
          apiFetch<ConfigResponse>("/v1/config"),
        ]);
        setHealth(h);
        setConfig(c);
      } catch (e) {
        toast.error(userFacingError(e, "Could not load system status"), { id: "status-load" });
      }
    })();
  }, []);

  return (
    <PageShell title="Status" subtitle="Live Base Sepolia system status.">
      <div className="radius-surface space-y-4 border border-border bg-card p-5 shadow-card">
        <Row label="Network" value={`${config?.network ?? "—"} · chain ${config?.chainId ?? "—"}`} />
        <Row label="API" value={health?.ok ? "ok" : "degraded"} />
        <Row label="Database" value={health?.database ?? "—"} />
        <Row label="RPC" value={health?.rpc ?? "—"} />
        <Row label="Indexer lag" value={health?.indexerLagBlocks == null ? "—" : `${health.indexerLagBlocks} blocks`} />
        <Row label="Manifest" value={health?.manifestHash ?? "—"} />
        <Row label="CDP wallet" value={health?.cdpWallet ?? "—"} />
        <Row label="Notifications" value={health?.notifications ?? "—"} />
        {config?.contracts
          ? Object.entries(config.contracts).map(([key, address]) => (
              <Row
                key={key}
                label={key}
                value={
                  <a className="font-medium text-brand underline" href={baseScanAddress(address)} target="_blank" rel="noreferrer">
                    {address.slice(0, 10)}…
                  </a>
                }
              />
            ))
          : null}
        {config?.assets?.map((asset) => (
          <Row
            key={asset.key}
            label={asset.symbol}
            value={
              <a className="font-medium text-brand underline" href={baseScanAddress(asset.address)} target="_blank" rel="noreferrer">
                {asset.address.slice(0, 10)}… · TEST
              </a>
            }
          />
        ))}
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Testnet</p>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
