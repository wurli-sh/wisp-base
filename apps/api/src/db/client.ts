import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { Config } from "../config.js";

export function createDb(config: Config) {
  return createClient(config.env.SUPABASE_URL, config.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node 20 lacks global WebSocket; cast satisfies supabase realtime transport typing.
    realtime: { transport: ws as never },
  });
}

export type Db = ReturnType<typeof createDb>;
