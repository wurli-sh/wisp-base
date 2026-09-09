import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

describe("rls pending_deliveries", () => {
  it(
    "denies anon reads of pending_deliveries",
    { skip: !databaseUrl || !supabaseUrl || !anonKey },
    async () => {
      const anon = createClient(supabaseUrl!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { transport: ws as never },
      });
      const { data, error } = await anon.from("pending_deliveries").select("id").limit(1);
      // Expect privilege denial: either error or empty with no leakage path.
      if (error) {
        assert.ok(error.message.length > 0);
        return;
      }
      assert.equal((data ?? []).length, 0);
    },
  );
});
