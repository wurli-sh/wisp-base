import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { walletLinkTypedData } from "@wisp/shared";
import type { ChainClient } from "../../src/chain/client.js";
import { verifyWalletSignature } from "../../src/auth/wallet-bindings.js";

const wallet = getAddress("0x1111111111111111111111111111111111111111");
const typedData = walletLinkTypedData({
  chainId: 84532,
  profileId: "profile-1",
  wallet,
  origin: "http://localhost:3000",
  nonce: "0x00112233445566778899aabbccddeeff",
  issuedAt: 1_900_000_000,
  expiresAt: 1_900_000_300,
});

describe("wallet signature verification", () => {
  it("accepts a regular EOA typed-data signature without an RPC fallback", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const eoaTypedData = walletLinkTypedData({
      chainId: 84532,
      profileId: "profile-1",
      wallet: account.address,
      origin: "http://localhost:3000",
      nonce: "0x00112233445566778899aabbccddeeff",
      issuedAt: 1_900_000_000,
      expiresAt: 1_900_000_300,
    });
    const signature = await account.signTypedData(eoaTypedData);
    let rpcCalled = false;
    const client = {
      readContract: async () => {
        rpcCalled = true;
        return "0xffffffff";
      },
    } as unknown as ChainClient;

    assert.equal(
      await verifyWalletSignature(client, eoaTypedData, account.address, signature),
      true,
    );
    assert.equal(rpcCalled, false);
  });

  it("falls through to ERC-1271 for a smart-wallet signature wrapper", async () => {
    const wrappedSignature = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "ownerIndex", type: "uint8" },
            { name: "signatureData", type: "bytes" },
          ],
        },
      ],
      [{ ownerIndex: 0, signatureData: `0x${"11".repeat(65)}` }],
    );
    let receivedSignature: Hex | undefined;
    const client = {
      readContract: async ({ args }: { args: readonly [Hex, Hex] }) => {
        receivedSignature = args[1];
        return "0x1626ba7e";
      },
    } as unknown as ChainClient;

    assert.equal(
      await verifyWalletSignature(client, typedData, wallet, wrappedSignature),
      true,
    );
    assert.equal(receivedSignature, wrappedSignature);
  });

  it("returns false when both EOA and ERC-1271 verification reject", async () => {
    const client = {
      readContract: async () => {
        throw new Error("contract call reverted");
      },
    } as unknown as ChainClient;

    assert.equal(
      await verifyWalletSignature(client, typedData, wallet, "0x1234"),
      false,
    );
  });
});
