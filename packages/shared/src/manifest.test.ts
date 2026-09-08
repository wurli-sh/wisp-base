import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDeploymentManifest,
  safeParseDeploymentManifest,
} from "./manifest.js";

const validFixture = {
  version: 1 as const,
  network: "base-sepolia" as const,
  chainId: 84532 as const,
  deploymentBlock: 46_564_333,
  deployer: "0x1111111111111111111111111111111111111111",
  deployedAt: "2026-09-09T00:00:00.000Z",
  contracts: {
    mockUsdc: "0x2222222222222222222222222222222222222222",
    assetRegistry: "0x3333333333333333333333333333333333333333",
    giftEscrow: "0x4444444444444444444444444444444444444444",
    demoStockRouter: "0x5555555555555555555555555555555555555555",
  },
  claimSigner: "0x6666666666666666666666666666666666666666",
  treasury: "0x1111111111111111111111111111111111111111",
  faucet: {
    maxAmount: "1000000000",
    cooldownSeconds: 3600,
  },
  assets: [
    {
      key: "WISPAAPL" as const,
      name: "Wisp Test Apple",
      symbol: "wAAPL",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      decimals: 18 as const,
      usdPriceE6: "316000000",
      priceAsOf: "2026-09-08",
      testOnly: true as const,
    },
    {
      key: "WISPNVDA" as const,
      name: "Wisp Test NVIDIA",
      symbol: "wNVDA",
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      decimals: 18 as const,
      usdPriceE6: "225000000",
      priceAsOf: "2026-09-08",
      testOnly: true as const,
    },
    {
      key: "WISPTSLA" as const,
      name: "Wisp Test Tesla",
      symbol: "wTSLA",
      address: "0xcccccccccccccccccccccccccccccccccccccccc",
      decimals: 18 as const,
      usdPriceE6: "367000000",
      priceAsOf: "2026-09-08",
      testOnly: true as const,
    },
  ],
  transactions: {
    deploy: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    ],
    seedInventory:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
  },
};

describe("parseDeploymentManifest", () => {
  it("accepts a full valid fixture", () => {
    const parsed = parseDeploymentManifest(validFixture);
    assert.equal(parsed.chainId, 84532);
    assert.equal(parsed.assets.length, 3);
    assert.equal(parsed.faucet.maxAmount, "1000000000");
  });

  it("rejects wrong chainId", () => {
    const result = safeParseDeploymentManifest({
      ...validFixture,
      chainId: 1,
    });
    assert.equal(result.success, false);
  });

  it("rejects missing claimSigner", () => {
    const { claimSigner: _omit, ...rest } = validFixture;
    const result = safeParseDeploymentManifest(rest);
    assert.equal(result.success, false);
  });

  it("rejects missing faucet", () => {
    const { faucet: _omit, ...rest } = validFixture;
    const result = safeParseDeploymentManifest(rest);
    assert.equal(result.success, false);
  });

  it("rejects empty assets", () => {
    const result = safeParseDeploymentManifest({
      ...validFixture,
      assets: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects incomplete or duplicate asset sets", () => {
    const incomplete = safeParseDeploymentManifest({
      ...validFixture,
      assets: validFixture.assets.slice(0, 2),
    });
    assert.equal(incomplete.success, false);

    const duplicate = safeParseDeploymentManifest({
      ...validFixture,
      assets: [validFixture.assets[0], validFixture.assets[0], validFixture.assets[2]],
    });
    assert.equal(duplicate.success, false);
  });

  it("rejects a missing deployment block", () => {
    const { deploymentBlock: _omit, ...rest } = validFixture;
    const result = safeParseDeploymentManifest(rest);
    assert.equal(result.success, false);
  });

  it("rejects invalid asset key", () => {
    const result = safeParseDeploymentManifest({
      ...validFixture,
      assets: [
        {
          ...validFixture.assets[0],
          key: "FAKE",
        },
      ],
    });
    assert.equal(result.success, false);
  });
});
