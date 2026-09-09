/** API client — Bearer JWT to Wisp Fastify API. */

export function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("testnet_api_not_configured");
    return "http://127.0.0.1:8787";
  }
  return url.replace(/\/$/, "");
}

function apiErrorMessage(data: unknown, status: number): string {
  const err = data as { error?: { code?: string; message?: string } | string };
  if (typeof err?.error === "string" && err.error.trim()) {
    return err.error.trim().slice(0, 140);
  }
  const code = err?.error && typeof err.error === "object" ? err.error.code : undefined;
  const msg =
    err?.error && typeof err.error === "object" ? err.error.message : undefined;
  if (code && String(code).trim()) return String(code).trim();
  if (msg && String(msg).trim().length <= 140) return String(msg).trim();
  if (status === 401 || status === 403) return "unauthorized";
  if (status >= 500) return "api_unreachable";
  return `api_${status}`;
}

export async function apiFetch<T>(
  path: string,
  opts: {
    token?: string | null;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = (opts.method ?? (opts.body !== undefined ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...opts.headers,
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers["idempotency-key"]) {
    headers["idempotency-key"] = crypto.randomUUID();
  }
  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("api_unreachable");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(apiErrorMessage(data, res.status));
  return data as T;
}

export type MeResponse = {
  profile: { id: string; created_at?: string; updated_at?: string } | null;
  identities: Array<{
    provider: "email" | "google" | "x";
    normalized_identifier: string;
    verified_at?: string;
  }>;
  wallet: {
    address: string;
    chainId: number;
    verifiedAt?: string;
  } | null;
};

export type ResolveResponse = {
  descriptor: {
    version: 1;
    descriptorId: string;
    kind: "email" | "x" | "basename";
    registered: boolean;
    recipientProfileRef: string | null;
    recipientAddress: string | null;
    issuedAt: number;
    validUntil: number;
    nonce: string;
  };
  signature: string;
  status: "on_wisp" | "basename_resolved" | "not_joined" | string;
};

export type InboxItem = {
  id: string;
  direction: "incoming" | "sent";
  status: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  stockAmount?: string;
  usdcAmount?: string;
  senderDisplayName?: string | null;
  anonymousSender?: boolean;
  message?: string | null;
  unlockAt?: string;
  expiresAt?: string;
  fundedTxHash?: string | null;
  claimedTxHash?: string | null;
  refundedTxHash?: string | null;
  onchainGiftId?: string | null;
  createdAt?: string;
};

export type ApiGift = {
  id: string;
  state: string;
  chainId?: number;
  onchainGiftId?: string | null;
  tokenAddress: string;
  tokenAmount: string;
  usdcAmount: string;
  unlockAt: string;
  expiresAt: string;
  anonymousSender?: boolean;
  message?: string | null;
  senderDisplayName?: string | null;
  txHash?: string | null;
  claimTxHash?: string | null;
  refundTxHash?: string | null;
  createdAt?: string;
};

export function toInboxItem(
  gift: ApiGift,
  direction: "incoming" | "sent",
  symbol?: string,
): InboxItem {
  return {
    id: gift.id,
    direction,
    status: gift.state,
    tokenAddress: gift.tokenAddress,
    tokenSymbol: symbol,
    stockAmount: gift.tokenAmount,
    usdcAmount: gift.usdcAmount,
    senderDisplayName: gift.senderDisplayName,
    anonymousSender: gift.anonymousSender,
    message: gift.message,
    unlockAt: gift.unlockAt,
    expiresAt: gift.expiresAt,
    fundedTxHash: gift.txHash,
    claimedTxHash: gift.claimTxHash,
    refundedTxHash: gift.refundTxHash,
    onchainGiftId: gift.onchainGiftId,
    createdAt: gift.createdAt,
  };
}

/** A self-gift belongs to both inbox and sent projections but is one activity. */
export function uniqueByGiftId<T extends { id: string }>(items: T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    // Callers put incoming first so self-gifts retain their claim-oriented view.
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()];
}

export type HealthResponse = {
  ok: boolean;
  network?: string;
  chainId?: number;
  indexerLagBlocks?: number | null;
  database?: string;
  rpc?: string;
  manifestHash?: string;
  notifications?: string;
  cdpWallet?: string;
};

export type ConfigResponse = {
  chainId: number;
  network: string;
  contracts: Record<string, string>;
  assets: Array<{
    key: string;
    symbol: string;
    address: string;
    decimals: number;
    usdPriceE6: string;
  }>;
  faucet?: { maxAmount: string; cooldownSeconds: number };
  deploymentBlock?: number;
};
