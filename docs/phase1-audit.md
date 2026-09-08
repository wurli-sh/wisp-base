# Phase 1 audit and resync

Audit date: 2026-09-09 (Asia/Kathmandu)  
Network: Base Sepolia (`84532`)  
Manifest: `deployments/base-sepolia.json`  
Deployment start block: `46564333`

## Result

Phase 1 is internally consistent and its live claim/refund path passes. The audit confirmed:

- bytecode at all four core contract addresses and all three B20 asset addresses;
- escrow owner, claim signer, registry, and demo-router wiring;
- router tUSDC, registry, escrow, and treasury wiring;
- exact tUSDC metadata, faucet cap, and cooldown;
- exact B20 names, symbols, decimals, registry keys, enabled flags, and fixed prices;
- positive router inventory for all three assets;
- escrow balances covering every locked balance;
- success receipts for all 29 deployment transactions; and
- a live funded/claimed gift plus a separately funded/refunded gift, both ending with zero escrow lock for the exercised asset.

Machine-readable results are under `evidence/base-sepolia/f53bb191d5b9fd39/`.

## Findings patched

1. The fork test previously returned success when RPC configuration was absent or the fork failed. It now loads root environment configuration and fails closed; a real Base Sepolia fork run passes.
2. Deployment reuse previously checked bytecode only on the four core addresses. It now runs the full live-state audit before reuse and refuses implicit redeployment when validation fails.
3. The manifest omitted the deployment block required by the Phase 2 indexer. The schema, live manifest, deploy writer, tests, and implementation plan now include block `46564333`.
4. Manifest validation accepted incomplete asset lists. It now requires the three exact unique stock keys, positive values, nonzero and distinct deployment addresses, valid dates, and a positive deployment block.
5. A new `npm run audit:phase1` command records code hashes, state, inventory, collateral, and receipt verification.
6. Explorer verification covered only tUSDC. When an explorer key is configured, deployment now attempts verification of every Wisp core contract with constructor arguments.
7. The live smoke was cooldown-sensitive, used wall-clock timestamps, and wrote weak evidence. It now reuses sufficient tUSDC, uses a small registry-derived quote, uses chain timestamps, waits for confirmations and public-RPC convergence, decodes events, proves final states, and writes atomically.
8. `--force-new` reused canonical deterministic B20 salts. Forced deployments now receive an automatic unique salt namespace unless one is explicitly supplied.
9. The root check omitted shared type checking and invariant tests. Both now run in `npm run check`.

## Accepted testnet limitations

- The deployed public tUSDC faucet cooldown is keyed by recipient. A third party can trigger another recipient's cooldown, although the recipient also receives the minted test tokens. This is a low-severity Sepolia-only availability concern, not a loss-of-funds issue; changing it would require replacing the already-audited deployment.
- The current claim signer and treasury are the deployer address because the optional separate signer was not configured at deployment. Signer rotation exists onchain; Phase 2 should use a dedicated backend signing key before any non-demo environment.
- Explorer verification remains accurately unconfirmed when `ETHERSCAN_API_KEY` is absent. Live bytecode and transaction receipts are independently verified by the audit command.
