import { decodeEventLog, getAddress, parseAbi, type Log } from "viem";
import { canTransitionGift, type GiftState } from "@wisp/shared";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { createChainClient, type ChainClient } from "./client.js";
import { enqueueGiftWaitingNotification } from "../delivery/notifications.js";
import { processNotificationOutbox } from "../delivery/outbox-worker.js";

const escrowEvents = parseAbi([
  "event GiftCreated(uint256 indexed giftId, address indexed sender, address indexed token, uint256 amount, uint64 unlockAt, uint64 expiresAt)",
  "event GiftClaimed(uint256 indexed giftId, address indexed recipient)",
  "event GiftRefunded(uint256 indexed giftId, address indexed sender)",
]);

const BLOCK_BATCH = 2_000n;
const REORG_REWIND = 12n;
const POLL_MS = 8_000;

type EscrowLog = Log & {
  eventName?: string;
  args?: Record<string, unknown>;
};

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
  }
  return value;
}

export function storedIntegerMatchesChainValue(
  stored: unknown,
  chainValue: string,
): boolean {
  if (typeof stored === "string") return stored === chainValue;
  if (typeof stored === "number") {
    // Never treat a rounded PostgREST JSON number as matching an exact chain
    // integer. After the exact-chain-integers migration this compatibility path
    // is only needed for safely representable values from older databases.
    return Number.isSafeInteger(stored) && BigInt(stored).toString() === chainValue;
  }
  return String(stored) === chainValue;
}

async function loadCursor(db: Db, chainId: number, deploymentBlock: number) {
  const { data, error } = await db
    .from("indexer_cursors")
    .select("block_number,block_hash")
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { blockNumber: BigInt(deploymentBlock) - 1n, blockHash: null as string | null };
  }
  return { blockNumber: BigInt(data.block_number), blockHash: data.block_hash as string };
}

async function saveCursor(db: Db, chainId: number, blockNumber: bigint, blockHash: string) {
  const { error } = await db.from("indexer_cursors").upsert({
    chain_id: chainId,
    block_number: Number(blockNumber),
    block_hash: blockHash,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function projectGiftState(
  db: Db,
  giftId: string,
  to: GiftState,
  patch: Record<string, unknown>,
  evidence: Record<string, unknown>,
): Promise<boolean> {
  const { data: gift, error } = await db.from("gifts").select("*").eq("id", giftId).maybeSingle();
  if (error) throw error;
  if (!gift) return false;
  const from = gift.state as GiftState;
  if (from === to) {
    const { data: patched, error: patchError } = await db
      .from("gifts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", giftId)
      .select("id")
      .maybeSingle();
    if (patchError) throw patchError;
    if (!patched) throw new Error("version_conflict");
    return true;
  }
  // Logs can be replayed after a cursor rewind. Never let an older event
  // move a terminal or already-advanced projection backwards.
  if (!canTransitionGift(from, to)) return false;
  const version = gift.version + 1;
  const { data: updated, error: updateError } = await db
    .from("gifts")
    .update({
      ...patch,
      state: to,
      version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", giftId)
    .eq("version", gift.version)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("version_conflict");
  const { error: eventError } = await db.from("gift_events").insert({
    gift_id: giftId,
    from_state: from,
    to_state: to,
    version,
    evidence,
  });
  if (eventError) throw eventError;
  return true;
}

async function handleGiftCreated(
  db: Db,
  config: Config,
  log: EscrowLog,
): Promise<string | null> {
  const args = log.args ?? {};
  const onchainGiftId = String(args.giftId);
  const token = String(args.token).toLowerCase();
  const amount = String(args.amount);
  const unlockAt = Number(args.unlockAt);
  const expiresAt = Number(args.expiresAt);
  const txHash = log.transactionHash!.toLowerCase();

  const { data: gifts, error } = await db
    .from("gifts")
    .select("*")
    .eq("tx_hash", txHash)
    .in("state", ["submitted", "funded", "delivered", "claimable", "claimed", "refunded"]);
  if (error) throw error;

  const match = (gifts ?? []).find((gift) => {
    return (
      gift.token_address.toLowerCase() === token &&
      // PostgREST may decode numeric(78,0) as a JS number, while viem exposes
      // event uint256 values as bigint/string. Normalize at this boundary.
      storedIntegerMatchesChainValue(gift.token_amount, amount) &&
      Math.floor(Date.parse(gift.unlock_at) / 1000) === unlockAt &&
      Math.floor(Date.parse(gift.expires_at) / 1000) === expiresAt
    );
  });
  if (!match) return null;

  const now = Date.now();
  const unlockMs = Date.parse(match.unlock_at);
  // A submitted draft must first become funded. A prior index run may already
  // have advanced it, in which case we only refresh the canonical linkage.
  await projectGiftState(db, match.id, "funded", { onchain_gift_id: onchainGiftId, tx_hash: txHash }, {
    event: "GiftCreated", onchainGiftId, txHash,
  });

  const { data: delivery } = await db
    .from("deliveries")
    .select("id,delivery_state")
    .eq("gift_id", match.id)
    .maybeSingle();
  if (delivery && delivery.delivery_state === "pending") {
    await db
      .from("deliveries")
      .update({ delivery_state: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", delivery.id);
    const { data: current } = await db.from("gifts").select("state").eq("id", match.id).maybeSingle();
    if (current?.state === "funded") {
      await projectGiftState(db, match.id, "delivered", {}, { event: "InboxDelivered" });
    }
  }

  const { data: current } = await db.from("gifts").select("state").eq("id", match.id).maybeSingle();
  if (unlockMs <= now && (current?.state === "funded" || current?.state === "delivered")) {
    await projectGiftState(db, match.id, "claimable", {}, { event: "GiftUnlocked" });
  }

  await enqueueGiftWaitingNotification(db, match.id, config.appOrigin);
  return match.id;
}

async function handleGiftClaimed(db: Db, log: EscrowLog): Promise<string | null> {
  const onchainGiftId = String(log.args?.giftId);
  const { data: gift, error } = await db
    .from("gifts")
    .select("id,state,version")
    .eq("onchain_gift_id", onchainGiftId)
    .maybeSingle();
  if (error) throw error;
  if (!gift) return null;
  if (gift.state === "funded" || gift.state === "delivered") {
    await projectGiftState(db, gift.id, "claimable", {}, { event: "GiftUnlocked" });
  }
  await projectGiftState(
    db,
    gift.id,
    "claimed",
    { claim_tx_hash: log.transactionHash!.toLowerCase() },
    { event: "GiftClaimed" },
  );
  return gift.id;
}

async function handleGiftRefunded(db: Db, log: EscrowLog): Promise<string | null> {
  const onchainGiftId = String(log.args?.giftId);
  const { data: gift, error } = await db
    .from("gifts")
    .select("id")
    .eq("onchain_gift_id", onchainGiftId)
    .maybeSingle();
  if (error) throw error;
  if (!gift) return null;
  const current = await db.from("gifts").select("state").eq("id", gift.id).maybeSingle();
  if (["funded", "delivered", "claimable"].includes(current.data?.state ?? "")) {
    await projectGiftState(db, gift.id, "refundable", {}, { event: "GiftExpired" });
  }
  await projectGiftState(
    db,
    gift.id,
    "refunded",
    { refund_tx_hash: log.transactionHash!.toLowerCase() },
    { event: "GiftRefunded" },
  );
  return gift.id;
}

async function persistChainEvent(
  db: Db,
  config: Config,
  log: EscrowLog,
  kind: string,
  giftId: string | null,
  onchainGiftId: string | null,
) {
  const { error } = await db.from("chain_events").upsert(
    {
      chain_id: config.manifest.chainId,
      block_number: Number(log.blockNumber),
      block_hash: log.blockHash,
      tx_hash: log.transactionHash!.toLowerCase(),
      log_index: Number(log.logIndex),
      kind,
      gift_id: giftId,
      onchain_gift_id: onchainGiftId,
      payload: { args: jsonSafe(log.args ?? {}), eventName: log.eventName },
      canonical: true,
    },
    { onConflict: "chain_id,tx_hash,log_index" },
  );
  if (error) throw error;
}

async function reconcileTemporalGiftStates(db: Db): Promise<void> {
  const now = new Date().toISOString();
  const { data: gifts, error } = await db
    .from("gifts")
    .select("id,state,unlock_at,expires_at")
    .in("state", ["funded", "delivered", "claimable"]);
  if (error) throw error;

  for (const gift of gifts ?? []) {
    if (Date.parse(gift.expires_at) <= Date.parse(now)) {
      await projectGiftState(db, gift.id, "refundable", {}, { event: "GiftExpired" });
    } else if (
      Date.parse(gift.unlock_at) <= Date.parse(now) &&
      (gift.state === "funded" || gift.state === "delivered")
    ) {
      await projectGiftState(db, gift.id, "claimable", {}, { event: "GiftUnlocked" });
    }
  }
}

async function checkReorg(
  client: ChainClient,
  db: Db,
  config: Config,
  cursor: { blockNumber: bigint; blockHash: string | null },
): Promise<{ blockNumber: bigint; blockHash: string | null }> {
  if (!cursor.blockHash || cursor.blockNumber <= 0n) return cursor;
  try {
    const block = await client.getBlock({ blockNumber: cursor.blockNumber });
    if (block.hash?.toLowerCase() === cursor.blockHash.toLowerCase()) return cursor;
  } catch {
    // fall through to rewind
  }
  const rewindTo = cursor.blockNumber > REORG_REWIND ? cursor.blockNumber - REORG_REWIND : 0n;
  await db
    .from("chain_events")
    .update({ canonical: false })
    .eq("chain_id", config.manifest.chainId)
    .gt("block_number", Number(rewindTo));
  return { blockNumber: rewindTo, blockHash: null };
}

/**
 * CDP smart-account sends resolve to a transaction hash only after bundling and
 * can already be mined by the time the browser attaches that hash to its draft.
 * A forward-only log cursor may therefore observe GiftCreated before the draft
 * becomes `submitted`. Reconcile outstanding submitted rows by receipt so that
 * late attachment, a page reload, or an API retry cannot strand a real gift.
 */
export async function reconcileSubmittedTransactions(
  client: ChainClient,
  db: Db,
  config: Config,
): Promise<number> {
  const { data: submitted, error } = await db
    .from("gifts")
    .select("id,tx_hash")
    .eq("chain_id", config.manifest.chainId)
    .eq("state", "submitted")
    .not("tx_hash", "is", null)
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  let reconciled = 0;
  const escrow = getAddress(config.manifest.contracts.giftEscrow);
  for (const gift of submitted ?? []) {
    if (!gift.tx_hash) continue;
    try {
      const receipt = await client.getTransactionReceipt({
        hash: gift.tx_hash as `0x${string}`,
      });
      if (receipt.status !== "success") continue;

      for (const receiptLog of receipt.logs) {
        if (receiptLog.address.toLowerCase() !== escrow.toLowerCase()) continue;
        let decoded: ReturnType<typeof decodeEventLog>;
        try {
          decoded = decodeEventLog({
            abi: escrowEvents,
            data: receiptLog.data,
            topics: receiptLog.topics,
          });
        } catch {
          continue;
        }
        if (decoded.eventName !== "GiftCreated") continue;

        const log = {
          ...receiptLog,
          eventName: decoded.eventName,
          args: decoded.args,
        } as EscrowLog;
        const matchedGiftId = await handleGiftCreated(db, config, log);
        const onchainGiftId =
          decoded.args && "giftId" in decoded.args
            ? String(decoded.args.giftId)
            : null;
        await persistChainEvent(
          db,
          config,
          log,
          decoded.eventName,
          matchedGiftId,
          onchainGiftId,
        );
        if (matchedGiftId === gift.id) reconciled += 1;
      }
    } catch {
      // Pending/not-yet-readable receipts remain submitted for the next tick.
    }
  }
  return reconciled;
}

async function indexOnce(client: ChainClient, db: Db, config: Config) {
  let cursor = await loadCursor(db, config.manifest.chainId, config.manifest.deploymentBlock);
  cursor = await checkReorg(client, db, config, cursor);

  // Run independently of the cursor so late tx-hash attachment is recoverable.
  await reconcileSubmittedTransactions(client, db, config);

  const latest = await client.getBlockNumber();
  if (latest <= cursor.blockNumber) {
    await reconcileTemporalGiftStates(db);
    await processNotificationOutbox(db, config);
    return;
  }

  let from = cursor.blockNumber + 1n;
  while (from <= latest) {
    const to = from + BLOCK_BATCH - 1n > latest ? latest : from + BLOCK_BATCH - 1n;
    const logs = (await client.getLogs({
      address: getAddress(config.manifest.contracts.giftEscrow),
      events: escrowEvents,
      fromBlock: from,
      toBlock: to,
    })) as EscrowLog[];

    for (const log of logs) {
      const kind = log.eventName ?? "Unknown";
      const onchainGiftId = log.args?.giftId != null ? String(log.args.giftId) : null;
      let giftId: string | null = null;
      if (kind === "GiftCreated") giftId = await handleGiftCreated(db, config, log);
      else if (kind === "GiftClaimed") giftId = await handleGiftClaimed(db, log);
      else if (kind === "GiftRefunded") giftId = await handleGiftRefunded(db, log);
      await persistChainEvent(db, config, log, kind, giftId, onchainGiftId);
    }

    const block = await client.getBlock({ blockNumber: to });
    await saveCursor(db, config.manifest.chainId, to, block.hash!);
    from = to + 1n;
  }

  await reconcileTemporalGiftStates(db);
  await processNotificationOutbox(db, config);
}

export function startIndexer(config: Config, db: Db): { stop: () => void } {
  const client = createChainClient(config);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await indexOnce(client, db, config);
    } catch (error) {
      console.error("[indexer]", error instanceof Error ? error.message : "indexer_error");
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
    }
  };

  void tick();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
