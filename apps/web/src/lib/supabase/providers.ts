import type { Provider } from "@supabase/supabase-js";

export type WispOAuthProvider = "google" | "x";

/**
 * Supabase product “X” uses provider id `x` (OAuth 2.0).
 * Older Twitter 1.0a used `twitter` — do not map X → twitter.
 */
export function toSupabaseProvider(provider: WispOAuthProvider): Provider {
  return provider as Provider;
}
