import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

describe("pending delivery lease", () => {
  it(
    "leases each pending row once under concurrent claim_pending_deliveries",
    { skip: !databaseUrl || !supabaseUrl || !secret },
    async () => {
      const config = loadConfig();
      const db = createDb(config);
      const ownerId = randomUUID();
      const giftId = randomUUID();
      const lookupHash = createHash("sha256").update(`lease-${giftId}`).digest("hex");

      // Synthetic auth.users rows are not insertable via PostgREST; reuse smoke profiles if present.
      const { data: profiles } = await db.from("profiles").select("id").limit(1);
      const profileId = profiles?.[0]?.id;
      if (!profileId) {
        // No profile yet — skip without failing CI on empty DB.
        return;
      }

      const { error: giftError } = await db.from("gifts").insert({
        id: giftId,
        owner_id: profileId,
        chain_id: 84532,
        token_address: "0x0000000000000000000000000000000000000001",
        token_amount: "1",
        usdc_amount: "1",
        unlock_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        state: "funded",
      });
      if (giftError) throw giftError;

      const { error: pendingError } = await db.from("pending_deliveries").insert({
        gift_id: giftId,
        recipient_lookup_hash: lookupHash,
        recipient_kind: "email",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
      if (pendingError) throw pendingError;

      const tokenA = randomUUID();
      const tokenB = randomUUID();
      const [a, b] = await Promise.all([
        db.rpc("claim_pending_deliveries", {
          p_profile_id: profileId,
          p_lookup_hashes: [lookupHash],
          p_token: tokenA,
        }),
        db.rpc("claim_pending_deliveries", {
          p_profile_id: profileId,
          p_lookup_hashes: [lookupHash],
          p_token: tokenB,
        }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;

      const total = (a.data?.length ?? 0) + (b.data?.length ?? 0);
      assert.equal(total, 1);

      await db.from("pending_deliveries").delete().eq("gift_id", giftId);
      await db.from("gifts").delete().eq("id", giftId);
      void ownerId;
    },
  );
});
