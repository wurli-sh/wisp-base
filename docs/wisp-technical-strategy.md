# Wisp Technical Strategy

## Product thesis

Wisp should be pitched as **the social delivery layer for programmable equities**: buy a small, named stock gift in one action; the recipient receives it in their **Wisp inbox** and claims into a wallet created during Wisp sign-in. The sender never sees a trading terminal, and the recipient does not need to understand wallets before they receive value.

This is more distinctive than “a stock swap UI.” Base explicitly asks builders to make tokenized equities useful as programmable, composable assets, and describes opportunities in new brokerage experiences and agent-managed portfolios. [Base, *Request for Builders: Tokenized Stocks*](https://blog.base.org/request-for-builders-tokenized-stocks)

## Critical Sepolia constraint

Base Sepolia (chain ID `84532`) is the right place to demonstrate contract security, Wisp-inbox claim, wallet creation and gift delivery. It is **not** proof that Wisp can purchase or custody live Coinbase shares. The public launch materials say Coinbase Tokenized Stocks are live on Base mainnet and available only to eligible non-US persons; stock mint/redeem is limited to KYC-onboarded Authorized Participants. [Base](https://blog.base.org/request-for-builders-tokenized-stocks) [Base Engineering](https://blog.base.dev/b20-tokenized-stocks-on-base)

Therefore the testnet should use three clearly labelled *Wisp Test Stocks* (for example, `wAAPL`, `wNVDA`, and `wTSLA`) that Wisp **creates** on Base Sepolia (B20 factory), plus a Wisp-deployed `MockUSDC` (`tUSDC`) minted through an in-app `/faucet` page. Never brand testnet tokens as Coinbase-issued, real shares, or redeemable stock. Do not buy mock assets from a DEX. Keep their address registry swappable so that a production launch only replaces test addresses with official allowlisted B20 addresses.

## The recommended MVP

### User flow

1. Sender signs in/connects, chooses a stock, dollar amount and a recipient: Base name, Wisp handle, or email.
2. Wisp resolves a Base name/handle to an address when possible. For email or an unresolved name, it creates a private claim commitment.
3. Sender signs **one** transaction: `fundAndCreateGift`. On Sepolia this transfers the selected test stock into Wisp’s escrow. A demo-only “buy” step can mint test stock from test USDC inside the same transaction, but must say it is simulated testnet execution.
4. Wisp delivers the gift to the recipient’s authenticated **Wisp inbox**. For an email recipient who has not joined Wisp, an email may invite them back to Wisp, but it is only a notification/deep link—not the inbox or the claim surface. The email address is never placed in transaction calldata, events, or a public database plaintext field.
5. In Wisp, the recipient signs in through email OTP, gets/recovers an embedded wallet, opens the inbox item, and calls `claim(giftId, secret)`. The escrow transfers the stock to their wallet.
6. Sender can cancel after expiry if unclaimed. Recipient sees “hold” as the default outcome.

### What “anonymous” should mean

Offer **private-from-recipient** gifts, not “fully anonymous.” On a public chain the escrow transaction is still observable. Do not put sender/recipient names, emails, message text, or a reversible email hash onchain. Store only a random `claimHash = keccak256(secret)` onchain; encrypt recipient metadata in the application database. The recipient’s claim does reveal their receiving address onchain.

### Core contracts

| Contract | Responsibility | Required protections |
|---|---|---|
| `GiftEscrow` | Holds token and records gift state | `nonReentrant`, checks-effects-interactions, SafeERC20, expiry/cancel rules, events without PII |
| `GiftRouter` (optional) | Atomically acquires test asset then creates gift | strict token/pool allowlist, deadline, `minAmountOut`, no arbitrary call target |
| `AssetRegistry` | Maps display symbols to verified token metadata | owner/admin role, timelock for production changes, deny unknown addresses |

For the hackathon, keep it to **one audited-looking `GiftEscrow` plus a TypeScript test-stock dispenser** unless atomic in-contract acquisition is essential to the story. Extra contracts increase attack surface without adding user value.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 in `apps/web` (`@wisp/web`), npm workspaces like `../wotta` | Monorepo: web, api, shared, and Foundry contracts as siblings under the repo root. |
| Wallet and onboarding | Coinbase CDP Embedded Wallets | Email OTP produces a user-controlled wallet without seed phrases; use it for recipient claim and optionally sender onboarding. [CDP docs](https://docs.cdp.coinbase.com/wallets/authentication/overview) |
| Chain client | `viem` + `wagmi` | Typed reads/writes, simulation and wallet integration; use `baseSepolia`. |
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin | Foundry tests/fuzzing plus familiar access control and token safety primitives. |
| Wisp inbox and notification | Supabase Auth + Postgres; Resend/Postmark only for notification | Authenticated, database-backed Wisp inbox is the delivery and claim surface. Email tells an unregistered recipient to open Wisp; it must never contain the claim secret or act as the claim UI. |
| Identity resolution | Base names/ENS resolver first; Wisp handles second | Base names resolve to a Base address; Wisp handles remain an opt-in mapping to an address or email. |
| Chain/indexing | Base RPC + viem event watcher; optional Ponder | Index `GiftCreated`, `Claimed`, `Cancelled` into inbox state, while treating onchain state as source of truth. Base’s Sepolia RPC is `https://sepolia.base.org`. [Base RPC docs](https://docs.base.org/base-chain/api-reference/rpc-overview) |
| Test assets | Test USDC + Wisp-owned clearly fictitious B20/ERC-20 representations | Allows a working end-to-end demo without pretending live equity liquidity exists. B20 is available on Base Sepolia; verify activation before use. [B20 guide](https://basehub.org/integration-guides/launch-a-b20-token/) |

## How Wisp gets the stock without a swap panel

There are three execution modes. Build the first now; make the abstraction support the latter two.

| Mode | UX | Implementation | Use now? |
|---|---|---|---|
| Pre-funded gift | Sender already holds the asset | `transferFrom(sender, escrow, amount)` then create gift | Yes; safest live demo |
| Intent / smart execution | Sender enters USDC amount and desired stock | Server obtains a quote; user signs a bounded order/transaction; router swaps then escrows | Demo as testnet simulation; production after liquidity validation |
| Custodial broker purchase | User pays fiat/USDC, operator buys/allocates equity | Requires licensed/regulated partner and jurisdiction controls | No; future only |

The front end may show “$25 of Apple,” but onchain must record token units. In production quote the exact B20 amount immediately before signature, show the price/time/slippage, and include `minAmountOut`, a short deadline, and the verified stock token address in the signed call. Never allow an API response to choose an arbitrary router or token address.

## B20 / real-stock integration facts

Coinbase stock tokens are B20 assets and remain ERC-20 compatible, but their multiplier changes for corporate actions. One displayed B20 token is not permanently one share; app valuation must read the current multiplier or use the issuer’s total-return feed. Contract addresses—not ticker strings—are the reliable identifier. [Base Engineering](https://blog.base.dev/b20-tokenized-stocks-on-base)

Production asset policy should therefore:

- Maintain a versioned, manually reviewed list of official contract addresses and prospectus URLs from Base’s official stock list.
- Query eligibility/compliance behavior before the sender confirms; transfers can be policy-blocked.
- Show a clear regional eligibility and risk disclosure before allowing a real-stock flow.
- Price positions using the supported total-return/Chainlink feed, and show an explicit “estimated value” label.

## Morpho, in plain English

Morpho is permissionless lending infrastructure. A **market** matches lenders supplying one loan asset with borrowers posting collateral. A **vault** (ERC-4626) pools deposits in one loan asset and lets a curator choose which markets receive that liquidity. It is not an automatic “earn yield on any stock” button.

For Wisp, do **not** deposit a claimed stock into Morpho by default. A vault’s asset must match what it accepts, and an unreviewed stock market creates real liquidity, oracle, liquidation, and suitability risk. Morpho itself says vaults delegate these risk decisions to a curator. [Morpho vault overview](https://legacy.docs.morpho.org/morpho-vaults/concepts/overview/)

The credible product extension is **Gift + Activate**:

- Default: claim the stock into self-custody.
- Optional post-claim: “Put cash to work” only when the gift is USDC and an approved USDC vault exists.
- Later, only with a vetted stock-collateral market: “Use as collateral” with clear liquidation education—not one-click auto-borrow.

If a vault integration is added, use Morpho’s SDK/bundler path because it adds ERC-4626 share-price guards during deposits. [Morpho SDK](https://docs.morpho.org/developers/sdks/morpho-sdk/)

## What will make this stand out to Base judges

No official public scoring rubric was found for the current tokenized-stock Builder Quest, so do not claim a rubric exists. The official brief rewards useful, novel applications of programmable equities. Wisp should make that obvious in a two-minute demo:

1. **Real product tension:** giving a first investment is emotionally meaningful but existing stock products assume a brokerage account and trading literacy.
2. **One signed action:** $10 of test Apple to a Base name, email, or handle—no trade screen.
3. **Recipient magic:** Wisp inbox → OTP → embedded wallet → claim. For a new email recipient, show the notification returning them to Wisp, then the inbox item appearing there—not a claim inside their mail client.
4. **Actual Base primitives:** Base Sepolia transaction, deployed escrow, verified event, B20 test asset, Base-name resolution, and Base App metadata already present in the repository.
5. **Trust story:** no PII onchain, recipient secret, expiry refund, verified asset registry, and testnet disclosure.
6. **Production depth:** tokenized-stock adapter respects B20 multiplier, verified addresses and compliance gates; optional Morpho is appropriately constrained rather than hand-waved.

## Scope order

**Must ship:** email/handle/address recipient abstraction; escrow, claim, expiry/cancel; two-wallet Sepolia demo; authenticated Wisp inbox; Base-name resolution; testnet disclosures; robust event states. Email is notification-only.

**High-value polish:** gift note/card, private-from-recipient toggle, gift tracking, claim progress animation, sender receipt, and a small “why this is safe” screen.

**Only if time remains:** one atomic simulated USDC-to-test-stock flow, B20-native mock issuance, sponsored gas, and a USDC Morpho vault demo after claim. Do not build a DEX panel, a live equities claim, autonomous trading, or a bespoke lending market.

## Sources

1. Base. [Request for Builders: Tokenized Stocks](https://blog.base.org/request-for-builders-tokenized-stocks), September 2026.
2. Base Engineering. [B20: The Standard Behind Tokenized Stocks on Base](https://blog.base.dev/b20-tokenized-stocks-on-base), August 2026.
3. Base. [RPC Overview](https://docs.base.org/base-chain/api-reference/rpc-overview), accessed September 2026.
4. BaseHub. [Launch a B20 Token](https://basehub.org/integration-guides/launch-a-b20-token/), accessed September 2026.
5. Coinbase Developer Platform. [Wallet Authentication](https://docs.cdp.coinbase.com/wallets/authentication/overview), accessed September 2026.
6. Coinbase Developer Platform. [Starter Apps](https://docs.cdp.coinbase.com/get-started/build-with-ai/starter-apps), accessed September 2026.
7. Morpho. [Morpho Vaults Overview](https://legacy.docs.morpho.org/morpho-vaults/concepts/overview/), accessed September 2026.
8. Morpho. [Morpho SDK](https://docs.morpho.org/developers/sdks/morpho-sdk/), accessed September 2026.
