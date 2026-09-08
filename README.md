# Wisp (Base)

Gift Coinbase tokenized stocks on Base to an `@handle` or email — acquire → gift → claim → use.

Monorepo layout matches `../wotta`: web lives in `apps/web`, shared packages and Foundry contracts land beside it.

## Prerequisites

- Node.js >= 20
- npm
- Base Foundry toolchain (`base-foundryup`) providing `base-forge`, `base-cast`, `base-anvil`

## Dev

```bash
npm install
npm run dev
```

Web app: `apps/web` (`@wisp/web`). Root scripts proxy into workspaces.

## Contracts (Base Sepolia)

```bash
npm run contracts:build
npm run contracts:test
npm run contracts:test:invariant
npm run contracts:test:fork
npm run deploy:sepolia
npm run audit:phase1
npm run smoke:contracts:sepolia
```

Deploy reads `DEPLOYER_PRIVATE_KEY` from the root `.env`. Addresses and the deployment start block land in `deployments/base-sepolia.json`. The audit resynchronizes the manifest against live bytecode, wiring, registry state, inventory, collateral, and all deployment receipts.

## Base dashboard verification

Homepage includes:

```html
<meta name="base:app_id" content="6aa042f3227c28e4adffe4ed" />
```
