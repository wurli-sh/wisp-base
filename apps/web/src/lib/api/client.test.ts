import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, toInboxItem, uniqueByGiftId, type ApiGift } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch mutation hardening", () => {
  it("adds an idempotency key to POST requests", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(init?.method).toBe("POST");
      expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/v1/test", { body: { value: 1 } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves a caller-supplied idempotency key", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["idempotency-key"]).toBe("fixed-key");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/v1/test", {
      method: "POST",
      headers: { "idempotency-key": "fixed-key" },
    });
  });
});

describe("gift projection mapping", () => {
  it("maps API state and transaction hashes into Inbox fields", () => {
    const gift: ApiGift = {
      id: "gift-1",
      state: "claimed",
      onchainGiftId: "9",
      tokenAddress: "0x0000000000000000000000000000000000000001",
      tokenAmount: "1250000000000000000",
      usdcAmount: "25000000",
      unlockAt: "2026-09-09T00:00:00.000Z",
      expiresAt: "2026-09-16T00:00:00.000Z",
      txHash: `0x${"11".repeat(32)}`,
      claimTxHash: `0x${"22".repeat(32)}`,
    };

    expect(toInboxItem(gift, "incoming", "wAAPL")).toMatchObject({
      id: "gift-1",
      direction: "incoming",
      status: "claimed",
      stockAmount: gift.tokenAmount,
      fundedTxHash: gift.txHash,
      claimedTxHash: gift.claimTxHash,
      onchainGiftId: "9",
      tokenSymbol: "wAAPL",
    });
  });

  it("renders a self-gift once in consolidated history", () => {
    const rows = uniqueByGiftId([
      { id: "gift-1", direction: "incoming" },
      { id: "gift-1", direction: "sent" },
      { id: "gift-2", direction: "sent" },
    ]);

    expect(rows).toEqual([
      { id: "gift-1", direction: "incoming" },
      { id: "gift-2", direction: "sent" },
    ]);
  });
});
