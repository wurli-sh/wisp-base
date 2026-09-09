<img src="docs/assets/banner.png" width="100%" alt="Wisp — gift test stocks on Base to a handle or email" />

<!-- TODO: replace banner asset at docs/assets/banner.png -->

[Live demo](https://wisp-base.vercel.app) · [Demo video](https://PLACEHOLDER_DEMO_VIDEO) 

## Problem

Gifting onchain assets usually means asking for a wallet address, funding gas,
and walking someone through a DEX or bridge. A simple gift should feel like
sending a message — pick an amount, name a person, and let them claim later.

## Solution

**Gift test stocks on Base. Send to a handle or email. Claim into an embedded wallet.**

Wisp lets anyone gift Base Sepolia **test stock** representations (wAAPL / wNVDA /
wTSLA) denominated in USD. Sign in with **Google, X, or email OTP**, use a
**Coinbase CDP** embedded Base wallet (gas sponsored via Paymaster when enabled),
and send to an `@handle`, email, or Basename — not a raw address. Recipients open
**Wisp Inbox**, claim after unlock, and hold the gift in their embedded wallet.
Senders mint demo funds from `/faucet` (tUSDC only).

Demo assets are **Wisp test stocks and tUSDC** — not real Coinbase-issued shares
or mainnet securities.

---

## Deployments

| Resource | Value |
| -------- | ----- |
| Frontend | [wisp-base.vercel.app](https://wisp-base.vercel.app) — `/` · `/send` · `/inbox` · `/faucet` · `/account` · `/claim` · `/how-it-works` |
| API | [wisp-base-api.onrender.com](https://wisp-base-api.onrender.com) |
| Settlement network | Base Sepolia (`84532`) |
| Explorer | [BaseScan Sepolia](https://sepolia.basescan.org) |
| MockUSDC (tUSDC) | [`0xbbA4…BF14`](https://sepolia.basescan.org/address/0xbbA4262B5CE51c0f7e24Be1424f235b521E8BF14) |
| Gift escrow | [`0x5B27…4B8A`](https://sepolia.basescan.org/address/0x5B276cc494AF6567Ff70A0AFd3BE65d53C4A4B8A) |
| Demo stock router | [`0x68F6…C4eC`](https://sepolia.basescan.org/address/0x68F6385524954811d937ca2AC4d402B9345aC4eC) |
| Asset registry | [`0x1363…e3Bf`](https://sepolia.basescan.org/address/0x136377Da41d876aD60c7d8129b1E6DDF6419e3Bf) |
| Test stocks | wAAPL · wNVDA · wTSLA (see manifest) |
| Deployment manifest | [`deployments/base-sepolia.json`](deployments/base-sepolia.json) |

Deployment sync: `pnpm deploy:env` · evidence under [`evidence/`](evidence/)

### Base Sepolia demo surface

| Available now | Notes |
| ------------- | ----- |
| OAuth / email OTP + handle send | Google, X, email; resolve email / `@handle` / Basename |
| CDP embedded smart wallet | Create / link / claim; Paymaster-sponsored gas when Portal allowlist is set |
| Faucet | Public `/faucet` mints capped tUSDC (not stock tokens) |
| Buy-and-gift | Fixed-price router inventory → escrow in one send flow |
| Wisp Inbox | Authenticated inbox; claim after `unlockAt`; refund after expiry |
| Indexer | In-process with the API when `RUN_INDEXER=true` |

**Not in this build:** mainnet B20 stocks, Morpho / yield automation, private
settlement, or multi-chain pay-in.

---

## Workspace

| Package / app | Purpose |
| ------------- | ------- |
| [`apps/web`](apps/web) | Next.js product UI — send, claim, inbox, faucet, account, how-it-works |
| [`apps/api`](apps/api) | Fastify API — auth sync, resolve, gifts, claim auth, delivery, indexer |
| [`contracts`](contracts) | Foundry — MockUSDC, asset registry, gift escrow, demo stock router |
| [`packages/shared`](packages/shared) | Manifests, claim / wallet-link typed data, API schemas, errors |

---

## Core Architecture

```text
Sender (browser)
  → signs in (Google / X / email OTP via Supabase)
  → creates / links CDP embedded Base smart wallet
  → mints tUSDC from /faucet when needed
  → resolves email / @handle / Basename through Wisp API
  → approves tUSDC and submits buyAndGift on Base Sepolia
  → gift is escrowed; delivery lands in recipient Inbox (or pending)

Recipient (browser)
  → signs in with the matching identity
  → opens Wisp Inbox
  → requests short-lived EIP-712 claim authorization from the API
  → claims into the bound CDP wallet after unlockAt
```

```text
apps/web (Next.js)
  ↓
@wisp/shared           manifests · claim / wallet-link typed data · API schemas
  ↓
apps/api (Fastify)     session sync · resolve · gifts · claim auth · indexer · outbox
  ↓
Supabase               Auth · profiles · identities · gifts · deliveries · bindings
  ↓
Base Sepolia           mock tUSDC · test stocks · gift escrow · demo router
```

```text
wisp-base/
├── apps/
│   ├── web/             Next.js frontend
│   └── api/             Fastify API + indexer
├── contracts/           Foundry contracts and tests
├── packages/
│   └── shared/          types, manifests, claim helpers
├── deployments/         checked-in Base Sepolia manifest
├── supabase/migrations/ Postgres schema
├── evidence/            smoke / audit evidence packs
├── docs/                phase audits and notes
└── scripts/             dev, deploy, audit, and sepolia scripts
```

---

## Gift Workflow

1. **Sign in** — Google, X, or email OTP through Supabase; CDP wallet provisions
   from the same identity (smart account + Paymaster when configured).
2. **Fund** — mint capped tUSDC from `/faucet` (stocks stay in router inventory).
3. **Resolve** — enter email, `@handle`, or Basename; API returns a signed
   descriptor (registered or pending).
4. **Prepare gift** — API creates the gift record; browser builds `buyAndGift`
   (approve + router call, or permit path when used).
5. **Fund onchain** — demo router swaps fixed-price inventory into escrow with
   unlock / expiry windows.
6. **Deliver** — registered profiles see the gift in Inbox; pending deliveries
   attach on first matching sign-in.
7. **Claim** — after `unlockAt`, recipient gets an EIP-712 claim authorization
   bound to gift, wallet, deadline, and escrow, then submits `claim`.
8. **Refund** — after `expiresAt`, the sender can refund an unclaimed funded gift.

---

## Key Features

- **Handle-first gifting** — send to email, `@handle`, or Basename; no raw address UX
- **OAuth + email OTP** — Supabase Auth; X when you want a public handle
- **CDP embedded wallets** — Coinbase smart accounts on Base Sepolia; gas sponsorship via Paymaster
- **USD-denominated test stocks** — pick dollars of wAAPL / wNVDA / wTSLA; no swap panel
- **Public faucet** — mint demo tUSDC before Send
- **Wisp Inbox** — authenticated delivery surface; optional anonymous sender label in UI only
- **Time-locked gifts** — `unlockAt` + `expiresAt` with sender refund after expiry
- **Backend claim auth** — short-lived EIP-712 authorizations; escrow enforces recipient
- **OpenAPI** — [`apps/api/openapi.json`](apps/api/openapi.json)

---

## Tech Stack

| Layer | Stack |
| ----- | ----- |
| Frontend | Next.js, React, Tailwind, viem, Coinbase CDP |
| API | Fastify, Zod, OpenAPI, Pino |
| Contracts | Solidity, Foundry (`base-forge`) |
| Settlement | Base Sepolia gift escrow + demo stock router |
| Wallets | Coinbase CDP embedded smart accounts + Paymaster |
| Data | Supabase (Postgres + Auth) |
| Hosting | Vercel (web) · Render (API Docker) |

---

## Local Development

**Prerequisites:** Node.js `>=20` · pnpm `10.33.0` · Base Foundry (`base-forge`) ·
Supabase for full integration · CDP Portal project for embedded wallets

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Starts web + API together |
| `pnpm dev:web` | Starts the Next.js web app |
| `pnpm dev:api` | Starts the Fastify API |
| `pnpm test` | Runs workspace tests |
| `pnpm test:e2e` | Playwright smoke routes |
| `pnpm contracts:build` | Builds Foundry contracts |
| `pnpm contracts:test` | Runs contract unit tests |
| `pnpm deploy:sepolia` | Deploys / refreshes Base Sepolia demo stack |
| `pnpm smoke:api` | API smoke against configured env |
| `pnpm deploy:env` | Syncs Vercel + creates/updates Render API from `.env` |
| `pnpm deploy:env -- --render-only --render-deploy` | Redeploys current Git commit on Render |
| `pnpm check` | Typecheck / lint gate |
| `pnpm audit:phase2` · `pnpm audit:phase3` | Phase audit scripts |

Copy [`.env.example`](.env.example) to `.env`. Prefer `http://localhost:3000` for
CDP Domains allowlisting during local wallet linking.

---

## Environment & Deployment

Hosted topology: **Vercel** web + **one Render** Docker API (Base Sepolia),
Supabase, and Base RPC. Indexer runs in-process when `RUN_INDEXER=true`.

```bash
pnpm deploy:env -- --dry-run \
  --web-origin https://wisp-base.vercel.app \
  --api-origin https://wisp-base-api.onrender.com

pnpm deploy:env
git push origin main
pnpm deploy:env -- --render-only --render-deploy
```

Also allowlist the production web origin in **CDP Portal → Domains** and
**Supabase Auth → Redirect URLs** (`/auth/callback`).

---

## Trust & Security

- **Testnet demo only** — assets are labelled test stocks / tUSDC; not real securities.
- **Public Base settlement** — escrow, sender, amounts, and timing are onchain and explorers can correlate them.
- **Anonymous mode is UI-only** — hides the sender name in Wisp Inbox; Base stays public.
- **Claim binding** — authorizations are short-lived and bound to gift id, recipient wallet, deadline, chain, and escrow.
- **Pending delivery** — unregistered recipients are keyed by HMAC of normalized identity until sign-in.
- **Not production-ready** — unaudited hackathon software. Do not use mainnet keys or real funds for demos.

More detail: phase notes under [`docs/`](docs/) · implementation plan `wisp-base-impl-plan.md` (local).

---

## Future Plans

The Sepolia demo path is live — faucet → send → inbox → claim. Next we harden
that loop and grow carefully toward verified Base assets.

- **Harden the demo** — Paymaster allowlists, indexer lag, claim/refund under load, clearer cold-start UX on free Render.
- **Real B20 assets** — swap Sepolia mocks for verified tokenized stock addresses via the deployment manifest when ready.
- **Post-claim surfaces** — optional Morpho / yield product after claim (no fake stock-yield claims).
- **Richer identity** — Basename depth, handle UX, and recovery without raw-address flows.
- **Review readiness** — threat model, runbooks, and an audit brief before any production claim.
