export const ERROR_CODES = [
  "unauthorized",
  "invalid_body",
  "invalid_identifier",
  "identity_already_linked",
  "identity_ambiguous",
  "wallet_unavailable",
  "wallet_already_linked",
  "wallet_signature_invalid",
  "wrong_network",
  "basename_not_found",
  "descriptor_expired",
  "descriptor_invalid",
  "asset_disabled",
  "quote_changed",
  "insufficient_test_usdc",
  "insufficient_router_inventory",
  "gift_not_found",
  "gift_not_funded",
  "gift_locked",
  "gift_expired",
  "gift_not_expired",
  "gift_already_terminal",
  "claim_not_owned",
  "claim_authorization_expired",
  "claim_authorization_invalid",
  "transaction_rejected",
  "transaction_reverted",
  "indexer_delayed",
  "notification_unavailable",
  "cookie_auth_forbidden",
  "not_found",
  "version_conflict",
  "idempotency_key_reuse",
  "wallet_unbound",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const GIFT_STATES = [
  "draft",
  "submitted",
  "funded",
  "delivered",
  "claimable",
  "claimed",
  "refundable",
  "refunded",
  "failed",
] as const;

export type GiftState = (typeof GIFT_STATES)[number];

export const TERMINAL_GIFT_STATES = new Set<GiftState>(["claimed", "refunded", "failed"]);

/** Allowed forward transitions. Indexer may advance; API must not move terminal backward. */
export const GIFT_TRANSITIONS: Record<GiftState, readonly GiftState[]> = {
  draft: ["submitted", "failed"],
  submitted: ["funded", "failed"],
  funded: ["delivered", "claimable", "refundable"],
  delivered: ["claimable", "refundable", "claimed"],
  claimable: ["claimed", "refundable"],
  claimed: [],
  refundable: ["refunded"],
  refunded: [],
  failed: [],
};

export function canTransitionGift(from: GiftState, to: GiftState): boolean {
  if (from === to) return true;
  if (TERMINAL_GIFT_STATES.has(from)) return false;
  return GIFT_TRANSITIONS[from].includes(to);
}
