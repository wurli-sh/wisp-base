import { describe, expect, it } from "vitest";
import { parseRecipient } from "@/lib/recipient";
import {
  formatStockAmount,
  quoteStockAmount,
  usdDollarsToUsdcRaw,
} from "@/lib/stocks";
import { baseScanTx, baseScanAddress } from "@/lib/format/amount";
import { sendReducer, initialSendState } from "@/features/send/sendReducer";

describe("parseRecipient", () => {
  it("accepts email", () => {
    expect(parseRecipient("Ada@Example.COM")).toEqual({
      ok: true,
      kind: "email",
      identifier: "ada@example.com",
    });
  });

  it("accepts x handle", () => {
    expect(parseRecipient("@vitalik")).toEqual({
      ok: true,
      kind: "x",
      identifier: "@vitalik",
    });
  });

  it("accepts basename", () => {
    expect(parseRecipient("alice.base.eth")).toEqual({
      ok: true,
      kind: "basename",
      identifier: "alice.base.eth",
    });
  });

  it("rejects raw addresses", () => {
    expect(parseRecipient("0x1234567890123456789012345678901234567890")).toEqual({
      ok: false,
      reason: "address",
    });
  });
});

describe("amount math", () => {
  it("converts dollars without float", () => {
    expect(usdDollarsToUsdcRaw("25")).toBe(25_000_000n);
    expect(usdDollarsToUsdcRaw("10.5")).toBe(10_500_000n);
  });

  it("quotes stock amount", () => {
    const quoted = quoteStockAmount(316_000_000n, 316_000_000n);
    expect(formatStockAmount(quoted)).toBe("1");
  });
});

describe("BaseScan links", () => {
  it("uses sepolia host for 84532", () => {
    expect(baseScanTx("0x" + "ab".repeat(32))).toContain("sepolia.basescan.org");
    expect(baseScanAddress("0x" + "11".repeat(20))).toContain("sepolia.basescan.org");
  });
});

describe("sendReducer", () => {
  it("transitions through prepare and submit", () => {
    let state = initialSendState;
    state = sendReducer(state, {
      type: "prepared",
      apiGiftId: "11111111-1111-1111-1111-111111111111",
      usePermit: true,
    });
    expect(state.stage).toBe("sending_gift");
    state = sendReducer(state, { type: "submitted", txHash: "0x" + "ab".repeat(32) });
    expect(state.stage).toBe("confirming_on_base");
    state = sendReducer(state, { type: "complete" });
    expect(state.stage).toBe("complete");
  });
});
