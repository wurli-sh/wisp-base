import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

describe("chain integer persistence", () => {
  it(
    "round-trips uint-like values through PostgREST as exact strings",
    { skip: !databaseUrl || !supabaseUrl || !secret },
    async () => {
      const db = createDb(loadConfig());
      const { data: profiles, error: profileError } = await db.from("profiles").select("id").limit(1);
      if (profileError) throw profileError;
      const profileId = profiles?.[0]?.id;
      if (!profileId) return;

      const giftId = randomUUID();
      const onchainGiftId = BigInt(`0x${giftId.replaceAll("-", "")}`).toString();
      const tokenAmount = "79113924050632911";
      const usdcAmount = "25000000";

      try {
        const { error: insertError } = await db.from("gifts").insert({
          id: giftId,
          owner_id: profileId,
          chain_id: 84532,
          onchain_gift_id: onchainGiftId,
          token_address: "0x0000000000000000000000000000000000000001",
          token_amount: tokenAmount,
          usdc_amount: usdcAmount,
          unlock_at: new Date(Date.now() - 60_000).toISOString(),
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          state: "funded",
        });
        if (insertError) throw insertError;

        const { data: gift, error: selectError } = await db
          .from("gifts")
          .select("onchain_gift_id,token_amount,usdc_amount")
          .eq("id", giftId)
          .single();
        if (selectError) throw selectError;

        assert.equal(typeof gift.onchain_gift_id, "string");
        assert.equal(typeof gift.token_amount, "string");
        assert.equal(typeof gift.usdc_amount, "string");
        assert.equal(gift.onchain_gift_id, onchainGiftId);
        assert.equal(gift.token_amount, tokenAmount);
        assert.equal(gift.usdc_amount, usdcAmount);
      } finally {
        await db.from("gifts").delete().eq("id", giftId);
      }
    },
  );
});
