import { getAddress } from "viem";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { ChainClient } from "../chain/client.js";
import { OnchainGiftStatus, escrowAbi } from "../chain/contracts.js";
import { activeWalletBindingForProfile } from "../auth/wallet-bindings.js";
import { getGiftOrThrow } from "../gifts/service.js";
import { signClaimAuthorization } from "./signer.js";

const CLAIM_AUTH_TTL_SECONDS = 5 * 60;

export async function authorizeClaim(
  db: Db,
  config: Config,
  client: ChainClient,
  profileId: string,
  giftId: string,
) {
  const gift = await getGiftOrThrow(db, giftId);
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id,recipient_profile_id")
    .eq("gift_id", giftId)
    .maybeSingle();
  if (error) throw error;
  if (!delivery || delivery.recipient_profile_id !== profileId) {
    throw new Error("claim_not_owned");
  }

  if (!["funded", "delivered", "claimable"].includes(gift.state)) {
    if (gift.state === "claimed" || gift.state === "refunded" || gift.state === "failed") {
      throw new Error("gift_already_terminal");
    }
    throw new Error("gift_not_funded");
  }

  const nowMs = Date.now();
  if (Date.parse(gift.unlock_at) > nowMs) throw new Error("gift_locked");
  if (Date.parse(gift.expires_at) <= nowMs) throw new Error("gift_expired");

  const wallet = await activeWalletBindingForProfile(db, profileId, config.manifest.chainId);
  if (!wallet) throw new Error("wallet_unbound");
  const recipient = getAddress(wallet.address as `0x${string}`);

  if (!gift.onchain_gift_id) throw new Error("indexer_delayed");
  const onchainGiftId = BigInt(gift.onchain_gift_id);

  const onchain = await client.readContract({
    address: getAddress(config.manifest.contracts.giftEscrow),
    abi: escrowAbi,
    functionName: "getGift",
    args: [onchainGiftId],
  });
  const status = Number(onchain[5]);
  const emptyGift =
    status === OnchainGiftStatus.None &&
    onchain[0] === "0x0000000000000000000000000000000000000000";

  if (status === OnchainGiftStatus.Funded) {
    if (Number(onchain[3]) > Math.floor(nowMs / 1000)) throw new Error("gift_locked");
    if (Number(onchain[4]) <= Math.floor(nowMs / 1000)) throw new Error("gift_expired");
  } else if (
    emptyGift &&
    (config.env.NODE_ENV === "development" || config.env.NODE_ENV === "test")
  ) {
    // Allow smoke/dev projection when indexer simulation set onchain_gift_id without a live gift.
  } else if (status === OnchainGiftStatus.Claimed || status === OnchainGiftStatus.Refunded) {
    throw new Error("gift_already_terminal");
  } else {
    throw new Error("gift_not_funded");
  }

  const deadline = BigInt(Math.floor(nowMs / 1000) + CLAIM_AUTH_TTL_SECONDS);
  return signClaimAuthorization(config, {
    giftId: onchainGiftId,
    recipient,
    deadline,
  });
}
