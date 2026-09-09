import { type Hex, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { claimAuthorizationTypedData, type ClaimAuthResult } from "@wisp/shared";
import type { Config } from "../config.js";

export async function signClaimAuthorization(
  config: Config,
  params: { giftId: bigint; recipient: `0x${string}`; deadline: bigint },
): Promise<ClaimAuthResult> {
  const account = privateKeyToAccount(config.env.claimAuthorizerPrivateKey);
  const typedData = claimAuthorizationTypedData({
    chainId: config.manifest.chainId,
    verifyingContract: getAddress(config.manifest.contracts.giftEscrow),
    giftId: params.giftId,
    recipient: params.recipient,
    deadline: params.deadline,
  });
  const signature = await account.signTypedData(typedData);
  return {
    giftId: params.giftId.toString(),
    recipient: getAddress(params.recipient),
    deadline: Number(params.deadline),
    signature: signature as Hex,
  };
}
