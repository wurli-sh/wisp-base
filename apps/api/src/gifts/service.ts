import { encodeFunctionData, getAddress } from "viem";
import {
  type CreateGiftRequest,
  type GiftState,
  createGiftRequestSchema,
} from "@wisp/shared";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { ChainClient } from "../chain/client.js";
import { registryAbi, routerAbi } from "../chain/contracts.js";
import { verifyDescriptor } from "../resolver/descriptors.js";
import { assertTransition } from "./state.js";

export type GiftRow = {
  id: string;
  owner_id: string;
  chain_id: number;
  onchain_gift_id: string | null;
  token_address: string;
  token_amount: string;
  usdc_amount: string;
  unlock_at: string;
  expires_at: string;
  anonymous_sender: boolean;
  message: string | null;
  state: GiftState;
  tx_hash: string | null;
  claim_tx_hash: string | null;
  refund_tx_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

function assetFromManifest(config: Config, tokenAddress: string) {
  const asset = config.manifest.assets.find(
    (candidate) => candidate.address.toLowerCase() === tokenAddress.toLowerCase(),
  );
  if (!asset) throw new Error("asset_disabled");
  return asset;
}

export async function getGiftOrThrow(db: Db, giftId: string): Promise<GiftRow> {
  const { data, error } = await db.from("gifts").select("*").eq("id", giftId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("gift_not_found");
  return data as GiftRow;
}

async function appendGiftEvent(
  db: Db,
  giftId: string,
  fromState: string | null,
  toState: string,
  version: number,
  evidence: Record<string, unknown> = {},
) {
  const { error } = await db.from("gift_events").insert({
    gift_id: giftId,
    from_state: fromState,
    to_state: toState,
    version,
    evidence,
  });
  if (error) throw error;
}

export async function createDraft(
  db: Db,
  config: Config,
  client: ChainClient,
  ownerId: string,
  raw: unknown,
) {
  const body = createGiftRequestSchema.parse(raw) as CreateGiftRequest;
  const descriptor = await verifyDescriptor(config, body.descriptor, body.signature);

  const unlockMs = Date.parse(body.unlockAt);
  const expiresMs = Date.parse(body.expiresAt);
  if (!(unlockMs < expiresMs) || !(expiresMs > Date.now())) throw new Error("invalid_body");

  const token = getAddress(body.tokenAddress as `0x${string}`);
  const asset = assetFromManifest(config, token);

  const enabled = await client.readContract({
    address: getAddress(config.manifest.contracts.assetRegistry),
    abi: registryAbi,
    functionName: "isEnabled",
    args: [token],
  });
  if (!enabled) throw new Error("asset_disabled");

  const quoted = await client.readContract({
    address: getAddress(config.manifest.contracts.assetRegistry),
    abi: registryAbi,
    functionName: "quoteStockAmount",
    args: [token, BigInt(body.usdcAmount)],
  });
  if (quoted.toString() !== body.quotedStockAmount) throw new Error("quote_changed");
  if (quoted === 0n) throw new Error("insufficient_router_inventory");

  const minStockAmount = (quoted * 99n) / 100n;
  const unlockAtSec = Math.floor(unlockMs / 1000);
  const expiresAtSec = Math.floor(expiresMs / 1000);

  const callData = encodeFunctionData({
    abi: routerAbi,
    functionName: "buyAndGift",
    args: [token, BigInt(body.usdcAmount), minStockAmount, BigInt(unlockAtSec), BigInt(expiresAtSec)],
  });

  const giftId = crypto.randomUUID();
  const { error: giftError } = await db.from("gifts").insert({
    id: giftId,
    owner_id: ownerId,
    chain_id: config.manifest.chainId,
    token_address: token.toLowerCase(),
    token_amount: quoted.toString(),
    usdc_amount: body.usdcAmount,
    unlock_at: body.unlockAt,
    expires_at: body.expiresAt,
    anonymous_sender: body.anonymousSender,
    message: body.message ?? null,
    state: "draft",
    version: 0,
  });
  if (giftError) throw giftError;

  await appendGiftEvent(db, giftId, null, "draft", 0, { descriptorId: descriptor.descriptorId });

  if (descriptor.registered && descriptor.recipientProfileRef) {
    const { error: deliveryError } = await db.from("deliveries").insert({
      gift_id: giftId,
      recipient_profile_id: descriptor.recipientProfileRef,
      recipient_address: descriptor.recipientAddress?.toLowerCase() ?? null,
      recipient_kind: descriptor.kind,
      delivery_state: "pending",
    });
    if (deliveryError) throw deliveryError;
  } else {
    const { error: pendingError } = await db.from("pending_deliveries").insert({
      gift_id: giftId,
      recipient_lookup_hash: descriptor.lookupHash,
      recipient_kind: descriptor.kind,
      expires_at: body.expiresAt,
    });
    if (pendingError) throw pendingError;
  }

  const gift = await getGiftOrThrow(db, giftId);
  return {
    gift: projectGiftForSender(gift, asset.symbol),
    router: {
      address: getAddress(config.manifest.contracts.demoStockRouter),
      functionName: "buyAndGift" as const,
      args: {
        stock: token,
        usdcAmount: body.usdcAmount,
        minStockAmount: minStockAmount.toString(),
        unlockAt: unlockAtSec,
        expiresAt: expiresAtSec,
      },
      data: callData,
    },
    quotedStockAmount: quoted.toString(),
    minStockAmount: minStockAmount.toString(),
  };
}

export async function markSubmitted(db: Db, ownerId: string, giftId: string, txHash: string) {
  const gift = await getGiftOrThrow(db, giftId);
  if (gift.owner_id !== ownerId) throw new Error("gift_not_found");
  // A retry may arrive after the indexer has already advanced this gift.
  // Treat attaching the same canonical hash as success in every later state.
  if (gift.state !== "draft" && gift.tx_hash === txHash.toLowerCase()) {
    return projectGiftForSender(gift);
  }
  assertTransition(gift.state, "submitted");
  const nextVersion = gift.version + 1;
  const { data, error } = await db
    .from("gifts")
    .update({
      state: "submitted",
      tx_hash: txHash.toLowerCase(),
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", giftId)
    .eq("version", gift.version)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("version_conflict");
  await appendGiftEvent(db, giftId, gift.state, "submitted", nextVersion, { txHash: txHash.toLowerCase() });
  return projectGiftForSender(data as GiftRow);
}

export function projectGiftForSender(gift: GiftRow, symbol?: string) {
  return {
    id: gift.id,
    chainId: gift.chain_id,
    onchainGiftId: gift.onchain_gift_id == null ? null : String(gift.onchain_gift_id),
    tokenAddress: gift.token_address,
    tokenAmount: String(gift.token_amount),
    usdcAmount: String(gift.usdc_amount),
    unlockAt: gift.unlock_at,
    expiresAt: gift.expires_at,
    anonymousSender: gift.anonymous_sender,
    message: gift.message,
    state: gift.state,
    txHash: gift.tx_hash,
    claimTxHash: gift.claim_tx_hash,
    refundTxHash: gift.refund_tx_hash,
    version: gift.version,
    createdAt: gift.created_at,
    updatedAt: gift.updated_at,
    symbol: symbol ?? null,
  };
}

export function projectGiftForRecipient(
  gift: GiftRow,
  delivery: {
    id: string;
    delivery_state: string;
    delivered_at: string | null;
    read_at: string | null;
  },
  senderDisplay: string | null,
) {
  return {
    id: gift.id,
    deliveryId: delivery.id,
    deliveryState: delivery.delivery_state,
    deliveredAt: delivery.delivered_at,
    readAt: delivery.read_at,
    onchainGiftId: gift.onchain_gift_id == null ? null : String(gift.onchain_gift_id),
    tokenAddress: gift.token_address,
    tokenAmount: String(gift.token_amount),
    usdcAmount: String(gift.usdc_amount),
    unlockAt: gift.unlock_at,
    expiresAt: gift.expires_at,
    message: gift.message,
    state: gift.state,
    txHash: gift.tx_hash,
    claimTxHash: gift.claim_tx_hash,
    refundTxHash: gift.refund_tx_hash,
    senderDisplayName: gift.anonymous_sender ? null : senderDisplay,
    anonymousSender: gift.anonymous_sender,
    createdAt: gift.created_at,
    updatedAt: gift.updated_at,
  };
}

export async function listSenderGifts(db: Db, ownerId: string, limit = 50) {
  const { data, error } = await db
    .from("gifts")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as GiftRow[]).map((gift) => projectGiftForSender(gift));
}

export async function getGiftProjection(db: Db, profileId: string, giftId: string) {
  const gift = await getGiftOrThrow(db, giftId);
  const isSender = gift.owner_id === profileId;
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id,delivery_state,delivered_at,read_at")
    .eq("gift_id", giftId)
    .eq("recipient_profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!delivery) {
    if (isSender) {
      return { role: "sender" as const, gift: projectGiftForSender(gift) };
    }
    throw new Error("gift_not_found");
  }
  const { data: sender } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", gift.owner_id)
    .maybeSingle();
  return {
    role: isSender ? ("both" as const) : ("recipient" as const),
    gift: projectGiftForRecipient(gift, delivery, sender?.display_name ?? null),
  };
}

export async function markRead(db: Db, profileId: string, giftId: string) {
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id,delivery_state")
    .eq("gift_id", giftId)
    .eq("recipient_profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!delivery) throw new Error("gift_not_found");
  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from("deliveries")
    .update({ delivery_state: "read", read_at: now })
    .eq("id", delivery.id);
  if (updateError) throw updateError;
  return { giftId, readAt: now };
}

export async function listInbox(db: Db, profileId: string, limit = 50) {
  const { data, error } = await db
    .from("deliveries")
    .select("id,delivery_state,delivered_at,read_at,gift:gifts(*)")
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const items = [];
  for (const row of data ?? []) {
    const gift = row.gift as unknown as GiftRow | null;
    if (!gift) continue;
    if (!["funded", "delivered", "claimable", "claimed", "refundable", "refunded"].includes(gift.state)) {
      continue;
    }
    const { data: sender } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", gift.owner_id)
      .maybeSingle();
    items.push(
      projectGiftForRecipient(
        gift,
        {
          id: row.id,
          delivery_state: row.delivery_state,
          delivered_at: row.delivered_at,
          read_at: row.read_at,
        },
        sender?.display_name ?? null,
      ),
    );
  }
  return { items };
}

export async function listActivity(db: Db, profileId: string, limit = 50) {
  const [inbox, sent] = await Promise.all([
    listInbox(db, profileId, limit),
    listSenderGifts(db, profileId, limit),
  ]);
  return {
    incoming: inbox.items,
    sent,
  };
}

/** Smoke/test helper: project indexer-funded state without waiting for chain. */
export async function simulateFundedProjection(
  db: Db,
  giftId: string,
  onchainGiftId: string,
): Promise<GiftRow> {
  const gift = await getGiftOrThrow(db, giftId);
  const target: GiftState =
    Date.parse(gift.unlock_at) <= Date.now() ? "claimable" : "funded";
  const nextVersion = gift.version + 1;
  const { data, error } = await db
    .from("gifts")
    .update({
      state: target,
      onchain_gift_id: onchainGiftId,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      tx_hash: gift.tx_hash ?? `0x${"ab".repeat(32)}`,
    })
    .eq("id", giftId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("gift_not_found");

  const { data: delivery } = await db
    .from("deliveries")
    .select("id")
    .eq("gift_id", giftId)
    .maybeSingle();
  if (delivery) {
    await db
      .from("deliveries")
      .update({ delivery_state: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", delivery.id);
  }
  return data as GiftRow;
}
