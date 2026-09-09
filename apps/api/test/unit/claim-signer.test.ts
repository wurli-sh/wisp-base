import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, hashTypedData, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { claimAuthorizationTypedData } from "@wisp/shared";
import type { Config } from "../../src/config.js";
import { signClaimAuthorization } from "../../src/claims/signer.js";

describe("claim signer", () => {
  it("signs claim authorization verifiable against typed data", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const escrow = getAddress("0x5B276cc494AF6567Ff70A0AFd3BE65d53C4A4B8A");
    const recipient = getAddress("0x1111111111111111111111111111111111111111");
    const giftId = 1n;
    const deadline = 1_900_000_000n;

    const config = {
      env: { claimAuthorizerPrivateKey: privateKey },
      manifest: {
        chainId: 84532,
        contracts: { giftEscrow: escrow },
      },
    } as unknown as Config;

    const result = await signClaimAuthorization(config, { giftId, recipient, deadline });
    assert.equal(result.giftId, "1");
    assert.equal(result.recipient.toLowerCase(), recipient.toLowerCase());
    assert.equal(result.deadline, Number(deadline));

    const typedData = claimAuthorizationTypedData({
      chainId: 84532,
      verifyingContract: escrow,
      giftId,
      recipient,
      deadline,
    });
    const digest = hashTypedData(typedData);
    assert.match(digest, /^0x[a-fA-F0-9]{64}$/);

    const valid = await verifyTypedData({
      address: account.address,
      ...typedData,
      signature: result.signature,
    });
    assert.equal(valid, true);
  });
});
