# Phase 2 preflight

Audit date: 2026-09-09 (Asia/Kathmandu)  
Authority: `wisp-base-impl-plan.md` §§12–24 / Phase 2 plan Task 0

## Phase 1 gate

`npm run audit:phase1` passed. Evidence refreshed under `evidence/base-sepolia/f53bb191d5b9fd39/phase1-audit.json`.

Manifest facts (no secrets):

- network / chainId: Base Sepolia / `84532`
- deploymentBlock: `46564333`
- claimSigner equals deployer (accepted Sepolia limitation)

## Environment key presence (values redacted)

| Key | Status |
| --- | --- |
| `DEPLOYER_ADDRESS` / `DEPLOYER_PRIVATE_KEY` | present |
| `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` | present |
| `ETHERSCAN_API_KEY` | present |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` / `DATABASE_URL` | present |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | present |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | synced from server keys |
| `IDENTITY_LOOKUP_KEY` / `DESCRIPTOR_SIGNING_KEY` | generated |
| `PORT` / `API_ORIGIN` / `CORS_ORIGINS` / `RUN_INDEXER` | set |
| `NEXT_PUBLIC_APP_ORIGIN` / `NEXT_PUBLIC_API_URL` | set |
| `CLAIM_AUTHORIZER_PRIVATE_KEY` | absent (fallback to deployer) |
| `CDP_*` / `RESEND_*` | absent → typed unavailable adapters |

## Patches applied in preflight

1. Extended `.env` with Phase 2 API/identity keys (local only).
2. Rewrote `.env.example` to match plan §14 names and alias comments.

## Next

Scaffold `apps/api`, Supabase migrations, then implement auth → gifts → claim → indexer → smoke → `audit:phase2`.
