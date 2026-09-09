import { getAddress, type Hex, type TypedDataDefinition } from "viem";

export const CLAIM_AUTHORIZATION_TYPES = {
  ClaimAuthorization: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export function claimAuthorizationTypedData(params: {
  chainId: number;
  verifyingContract: `0x${string}`;
  giftId: bigint;
  recipient: `0x${string}`;
  deadline: bigint;
}): TypedDataDefinition {
  return {
    domain: {
      name: "WispGiftEscrow",
      version: "1",
      chainId: params.chainId,
      verifyingContract: getAddress(params.verifyingContract),
    },
    types: CLAIM_AUTHORIZATION_TYPES,
    primaryType: "ClaimAuthorization",
    message: {
      giftId: params.giftId,
      recipient: getAddress(params.recipient),
      deadline: params.deadline,
    },
  };
}

export const WALLET_LINK_TYPES = {
  WalletLink: [
    { name: "profileId", type: "string" },
    { name: "wallet", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "origin", type: "string" },
    { name: "nonce", type: "string" },
    { name: "purpose", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export function walletLinkTypedData(params: {
  chainId: number;
  profileId: string;
  wallet: `0x${string}`;
  origin: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): TypedDataDefinition {
  return {
    domain: {
      name: "Wisp",
      version: "1",
      chainId: params.chainId,
    },
    types: WALLET_LINK_TYPES,
    primaryType: "WalletLink",
    message: {
      profileId: params.profileId,
      wallet: getAddress(params.wallet),
      chainId: BigInt(params.chainId),
      origin: params.origin,
      nonce: params.nonce,
      purpose: "wallet_link",
      issuedAt: BigInt(params.issuedAt),
      expiresAt: BigInt(params.expiresAt),
    },
  };
}

export type ClaimAuthResult = {
  giftId: string;
  recipient: Hex;
  deadline: number;
  signature: Hex;
};
