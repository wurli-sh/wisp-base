import { createHash, randomBytes } from "node:crypto";
import {
  type Hex,
  getAddress,
  hashTypedData,
  verifyTypedData,
} from "viem";
import { walletLinkTypedData } from "@wisp/shared";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { ChainClient } from "../chain/client.js";
import { erc1271Abi } from "../chain/contracts.js";

const CHALLENGE_TTL_MS = 5 * 60_000;
const ERC1271_MAGIC = "0x1626ba7e";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

export type ActiveWalletBinding = {
  id: string;
  profile_id: string;
  address: string;
  chain_id: number;
  wallet_provider: string;
  verified_at: string;
};

export async function activeWalletBindingForProfile(
  db: Db,
  profileId: string,
  chainId: number,
): Promise<ActiveWalletBinding | null> {
  const { data, error } = await db
    .from("wallet_bindings")
    .select("id,profile_id,address,chain_id,wallet_provider,verified_at")
    .eq("profile_id", profileId)
    .eq("chain_id", chainId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findActiveWalletBindingByAddress(
  db: Db,
  chainId: number,
  address: `0x${string}`,
): Promise<ActiveWalletBinding | null> {
  const lowered = address.toLowerCase();
  const { data, error } = await db
    .from("wallet_bindings")
    .select("id,profile_id,address,chain_id,wallet_provider,verified_at")
    .eq("chain_id", chainId)
    .is("revoked_at", null);
  if (error) throw error;
  return (data ?? []).find((row) => row.address.toLowerCase() === lowered) ?? null;
}

function requireWalletOrigin(config: Config, originHeader: string | undefined): string {
  const origin = originHeader?.replace(/\/$/, "") || config.appOrigin;
  if (!config.corsOrigins.includes(origin) && origin !== config.appOrigin) {
    throw new Error("invalid_body");
  }
  return origin;
}

export async function createWalletChallenge(
  db: Db,
  config: Config,
  profileId: string,
  address: string,
  originHeader: string | undefined,
) {
  const wallet = getAddress(address as `0x${string}`);
  const origin = requireWalletOrigin(config, originHeader);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = `0x${randomBytes(16).toString("hex")}`;
  const typedData = walletLinkTypedData({
    chainId: config.manifest.chainId,
    profileId,
    wallet,
    origin,
    nonce,
    issuedAt: Math.floor(issuedAt.getTime() / 1000),
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });
  const challengeId = crypto.randomUUID();
  const { error } = await db.from("wallet_challenges").insert({
    id: challengeId,
    profile_id: profileId,
    nonce_hash: nonce,
    challenge_hash: sha256(stableJson(typedData)),
    address: wallet.toLowerCase(),
    purpose: "wallet_link",
    origin,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { challengeId, typedData, expiresAt: expiresAt.toISOString() };
}

export async function verifyWalletSignature(
  client: ChainClient,
  typedData: ReturnType<typeof walletLinkTypedData>,
  address: `0x${string}`,
  signature: Hex,
): Promise<boolean> {
  // ERC-1271 signatures are contract-specific byte payloads and are commonly
  // longer than the 64/65-byte signatures accepted by EOA recovery. Viem
  // throws for those lengths, so EOA recovery must be a best-effort branch;
  // otherwise valid smart-account signatures never reach isValidSignature.
  try {
    const eoaValid = await verifyTypedData({
      address,
      ...typedData,
      signature,
    });
    if (eoaValid) return true;
  } catch {
    // Continue with ERC-1271 verification below.
  }

  try {
    const digest = hashTypedData(typedData);
    const result = await client.readContract({
      address,
      abi: erc1271Abi,
      functionName: "isValidSignature",
      args: [digest, signature],
    });
    return typeof result === "string" && result.toLowerCase() === ERC1271_MAGIC;
  } catch {
    return false;
  }
}

export async function linkWallet(
  db: Db,
  config: Config,
  client: ChainClient,
  profileId: string,
  input: { challengeId: string; address: string; signature: string },
  originHeader: string | undefined,
) {
  const wallet = getAddress(input.address as `0x${string}`);
  const origin = requireWalletOrigin(config, originHeader);
  const { data: challenge, error } = await db
    .from("wallet_challenges")
    .select("*")
    .eq("id", input.challengeId)
    .eq("profile_id", profileId)
    .is("consumed_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!challenge) throw new Error("wallet_signature_invalid");
  if (new Date(challenge.expires_at).getTime() <= Date.now()) throw new Error("wallet_signature_invalid");
  if (challenge.address.toLowerCase() !== wallet.toLowerCase()) throw new Error("wallet_signature_invalid");
  if (challenge.origin !== origin) throw new Error("wallet_signature_invalid");

  const typedData = walletLinkTypedData({
    chainId: config.manifest.chainId,
    profileId,
    wallet,
    origin: challenge.origin,
    nonce: challenge.nonce_hash,
    issuedAt: Math.floor(new Date(challenge.issued_at).getTime() / 1000),
    expiresAt: Math.floor(new Date(challenge.expires_at).getTime() / 1000),
  });
  if (sha256(stableJson(typedData)) !== challenge.challenge_hash) {
    throw new Error("wallet_signature_invalid");
  }

  const valid = await verifyWalletSignature(client, typedData, wallet, input.signature as Hex);
  if (!valid) throw new Error("wallet_signature_invalid");

  const { data: consumed, error: consumeError } = await db
    .from("wallet_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed) throw new Error("wallet_signature_invalid");

  const existingByAddress = await findActiveWalletBindingByAddress(db, config.manifest.chainId, wallet);
  if (existingByAddress && existingByAddress.profile_id !== profileId) {
    throw new Error("wallet_already_linked");
  }

  const existingByProfile = await activeWalletBindingForProfile(db, profileId, config.manifest.chainId);
  if (existingByProfile && existingByProfile.address.toLowerCase() === wallet.toLowerCase()) {
    return { address: wallet, linked: true as const, reconnected: true as const };
  }

  if (existingByProfile) {
    const { error: revokeError } = await db
      .from("wallet_bindings")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existingByProfile.id);
    if (revokeError) throw revokeError;
  }

  const { error: insertError } = await db.from("wallet_bindings").insert({
    profile_id: profileId,
    chain_id: config.manifest.chainId,
    address: wallet.toLowerCase(),
    wallet_provider: "cdp",
    verified_at: new Date().toISOString(),
  });
  if (insertError) {
    if (insertError.code === "23505") throw new Error("wallet_already_linked");
    throw insertError;
  }
  return { address: wallet, linked: true as const, reconnected: false as const };
}

async function hasClaimableDeliveryDependingOnWallet(db: Db, profileId: string): Promise<boolean> {
  const { data, error } = await db
    .from("deliveries")
    .select("id,gift:gifts!inner(state,expires_at)")
    .eq("recipient_profile_id", profileId);
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).some((row) => {
    const gift = row.gift as unknown as { state: string; expires_at: string } | null;
    if (!gift) return false;
    if (!["funded", "delivered", "claimable"].includes(gift.state)) return false;
    return Date.parse(gift.expires_at) > now;
  });
}

export async function unlinkWallet(db: Db, profileId: string, chainId: number) {
  if (await hasClaimableDeliveryDependingOnWallet(db, profileId)) {
    throw new Error("wallet_unbound");
  }
  const { data, error } = await db
    .from("wallet_bindings")
    .update({ revoked_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("chain_id", chainId)
    .is("revoked_at", null)
    .select("address");
  if (error) throw error;
  return { unlinked: data?.length ?? 0 };
}
