import { createHmac } from "node:crypto";
import { getAddress } from "viem";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { normalizeIdentifier } from "../auth/normalize.js";
import { activeWalletBindingForProfile } from "../auth/wallet-bindings.js";

export type LookupNamespace = "email" | "x" | "basename-address:84532";

export function identityLookupHash(
  identityLookupKey: string,
  namespace: LookupNamespace,
  normalized: string,
): string {
  return createHmac("sha256", identityLookupKey)
    .update(`${namespace}:${normalized}`)
    .digest("hex");
}

export function lookupHashForEmail(config: Config, email: string): string {
  return identityLookupHash(
    config.env.IDENTITY_LOOKUP_KEY,
    "email",
    normalizeIdentifier("email", email),
  );
}

export function lookupHashForX(config: Config, handle: string): string {
  return identityLookupHash(config.env.IDENTITY_LOOKUP_KEY, "x", normalizeIdentifier("x", handle));
}

export function lookupHashForAddress(config: Config, address: string): string {
  return identityLookupHash(
    config.env.IDENTITY_LOOKUP_KEY,
    "basename-address:84532",
    getAddress(address as `0x${string}`).toLowerCase(),
  );
}

export function lookupHashForKind(
  config: Config,
  kind: "email" | "x" | "basename",
  value: string,
): string {
  if (kind === "email") return lookupHashForEmail(config, value);
  if (kind === "x") return lookupHashForX(config, value);
  return lookupHashForAddress(config, value);
}

type ClaimedPendingRow = {
  id: string;
  gift_id: string;
  recipient_kind: string;
  recipient_lookup_hash: string;
};

async function transitionAssignedGift(db: Db, giftId: string, now: string): Promise<void> {
  const { data: gift, error } = await db
    .from("gifts")
    .select("id,state,version,unlock_at")
    .eq("id", giftId)
    .maybeSingle();
  if (error) throw error;
  if (!gift) return;

  let state = gift.state as string;
  let version = gift.version as number;
  if (state === "funded") {
    const { data: updated, error: updateError } = await db
      .from("gifts")
      .update({ state: "delivered", version: version + 1, updated_at: now })
      .eq("id", giftId)
      .eq("version", version)
      .select("version")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("version_conflict");
    await db.from("gift_events").insert({
      gift_id: giftId,
      from_state: "funded",
      to_state: "delivered",
      version: version + 1,
      evidence: { event: "InboxDelivered" },
    });
    state = "delivered";
    version += 1;
  }

  if (state === "delivered" && Date.parse(gift.unlock_at as string) <= Date.parse(now)) {
    const { data: updated, error: updateError } = await db
      .from("gifts")
      .update({ state: "claimable", version: version + 1, updated_at: now })
      .eq("id", giftId)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("version_conflict");
    const { error: eventError } = await db.from("gift_events").insert({
      gift_id: giftId,
      from_state: "delivered",
      to_state: "claimable",
      version: version + 1,
      evidence: { event: "InboxUnlocked" },
    });
    if (eventError) throw eventError;
  }
}

export async function claimPendingDeliveriesForProfile(
  db: Db,
  config: Config,
  profileId: string,
  synced: { provider: string; identifier: string }[],
): Promise<number> {
  const hashes = new Set<string>();
  for (const identity of synced) {
    if (identity.provider === "x") {
      hashes.add(lookupHashForX(config, identity.identifier));
    } else if (identity.provider === "email" || identity.provider === "google") {
      hashes.add(lookupHashForEmail(config, identity.identifier));
    }
  }

  const wallet = await activeWalletBindingForProfile(db, profileId, config.manifest.chainId);
  if (wallet) {
    hashes.add(lookupHashForAddress(config, wallet.address));
  }
  if (hashes.size === 0) return 0;

  const token = crypto.randomUUID();
  const { data, error } = await db.rpc("claim_pending_deliveries", {
    p_profile_id: profileId,
    p_lookup_hashes: [...hashes],
    p_token: token,
  });
  if (error) throw error;

  let delivered = 0;
  const now = new Date().toISOString();
  for (const row of (data ?? []) as ClaimedPendingRow[]) {
    const { data: existing, error: existingError } = await db
      .from("deliveries")
      .select("id")
      .eq("gift_id", row.gift_id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { error: updateDeliveryError } = await db
        .from("deliveries")
        .update({
          recipient_profile_id: profileId,
          delivery_state: "delivered",
          delivered_at: now,
        })
        .eq("id", existing.id);
      if (updateDeliveryError) throw updateDeliveryError;
    } else {
      const { error: insertError } = await db.from("deliveries").insert({
        gift_id: row.gift_id,
        recipient_profile_id: profileId,
        recipient_kind: row.recipient_kind,
        delivery_state: "delivered",
        delivered_at: now,
      });
      if (insertError) throw insertError;
    }

    // Keep the lease until both the Inbox row and the gift projection are
    // durable. A failure leaves the row retryable after its short lease.
    await transitionAssignedGift(db, row.gift_id, now);

    const { error: finishError } = await db
      .from("pending_deliveries")
      .update({
        delivered_profile_id: profileId,
        delivered_at: now,
        processing_token: null,
        processing_expires_at: null,
      })
      .eq("id", row.id)
      .eq("processing_token", token)
      .is("delivered_at", null);
    if (finishError) throw finishError;
    delivered += 1;
  }
  return delivered;
}
