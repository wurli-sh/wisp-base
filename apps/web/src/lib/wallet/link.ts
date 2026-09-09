"use client";

import { getAddress } from "viem";
import { apiFetch } from "@/lib/api/client";
import { fetchMe, getAccessToken } from "@/lib/auth";
import type { WispWallet } from "./WalletProvider";

export async function ensureBoundWallet(wallet: WispWallet): Promise<`0x${string}`> {
  const address = getAddress(await wallet.ensureWallet());
  const token = await getAccessToken();
  if (!token) throw new Error("unauthorized");

  // Smart accounts are counterfactual until first user op; ERC-1271 bind needs code.
  await wallet.ensureDeployed();

  const me = await fetchMe(token);
  if (
    me.ok &&
    me.data.wallet?.chainId === 84532 &&
    me.data.wallet.address.toLowerCase() === address.toLowerCase()
  ) {
    return address;
  }

  const challenge = await apiFetch<{
    challengeId: string;
    typedData: {
      domain: Record<string, unknown>;
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    };
  }>("/v1/wallet/challenge", { token, body: { address } });
  const signature = await wallet.signTypedData(challenge.typedData);
  await apiFetch<unknown>("/v1/wallet/link", {
    token,
    body: { challengeId: challenge.challengeId, address, signature },
  });
  return address;
}
