# Phase 2 audit and resync

Audit date: 2026-09-09 (UTC)
Network: Base Sepolia (`84532`)
Manifest: `deployments/base-sepolia.json`
Deployment start block: `46564333`

## Result

Phase 2 core checks passed:

- public schema tables present: chain_events, deliveries, gifts, idempotency_keys, identities, indexer_cursors, notification_outbox, pending_deliveries, profiles, wallet_bindings
- claim_pending_deliveries SECURITY DEFINER function present
- notification outbox is unique per gift and notification kind
- escrow bytecode present at 0x5B276cc494AF6567Ff70A0AFd3BE65d53C4A4B8A
- CLAIM_AUTHORIZER/DEPLOYER derives manifest claimSigner
- apps/api/openapi.json present
- api-smoke evidence found: evidence/base-sepolia/3aacfad17bbc1b7a/api-smoke.json
- CDP wallet provider: configured
- Resend notifications: configured

## Findings patched

1. Preflight environment resync and hosted `db:reset` via `scripts/db/reset.sh`.
2. Wallet-link typed data is JSON-safe at the API boundary.
3. Every mutating route requires and persists an idempotency key.
4. Wallet binding immediately retries matching pending Inbox deliveries.
5. Indexer projections advance through funded/delivered/claimable/refundable states, survive replay without regression, and serialize event bigint values safely.
6. Notification outbox is unique per gift/kind and sends Resend's generic Inbox-only email when configured.

## Accepted testnet limitations

- Claim signer remains the deployer address until a dedicated key is rotated onchain.
- CDP embedded wallet credentials are configured; smoke binds local EOAs.
- Resend is configured; when configured, the outbox sends generic Inbox-only notifications, otherwise it marks jobs `unavailable` without blocking Inbox.
- `api-smoke.json` is produced by `npm run smoke:api` (simulated funded projection allowed in development when onchain gift is empty).

