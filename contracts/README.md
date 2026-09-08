# Wisp contracts

Base Sepolia-only contract stack for the Wisp demo. The three stock tokens are B20 test assets, not shares or production financial instruments.

## Contracts

- `WispAssetRegistry`: allowlist and fixed six-decimal USD quotes.
- `WispGiftEscrow`: funded gifts, EIP-712 recipient claims, expiry refunds, and locked-balance accounting.
- `WispDemoStockRouter`: tUSDC payment and atomic stock-inventory gift funding.
- `MockUSDC`: six-decimal Sepolia tUSDC with a 1,000 tUSDC faucet cap and one-hour recipient cooldown.

Use the Base Foundry binaries because deployment creates B20 assets through Base's official standard library.

```bash
npm run contracts:fmt:check
npm run contracts:build
npm run contracts:test
npm run contracts:test:invariant
npm run contracts:test:fork
npm run deploy:sepolia
npm run audit:phase1
npm run smoke:contracts:sepolia
```

Deployment reads the root `.env`, writes `deployments/base-sepolia.json` atomically, and reuses an existing deployment only after checking its receipts, bytecode, wiring, registry configuration, inventory, and collateral. `--force-new` is required to request a replacement deployment.

The live smoke uses small values, waits for receipt confirmations, proves both claim and refund terminal states, and writes redacted evidence under `evidence/base-sepolia/<manifest-hash>/`.
