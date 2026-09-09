export const LANDING_HEADLINE = [
  "Gift stocks.",
  "To people, not addresses.",
] as const;

export const LANDING_SUBHEAD =
  "Choose a Wisp test stock on Base Sepolia, gift to an @handle, email, or Basename — they claim in Wisp Inbox.";

export const LANDING_INBOX_PROMPT = "Getting a gift? Open your inbox.";

export const SITE_DESCRIPTION =
  "Gift Wisp test stocks on Base Sepolia by handle, email, or Basename — faucet tUSDC, send, claim.";

export const HOW_IT_WORKS_STEPS = [
  {
    title: "Type a handle.",
    body: "Email, @handle, or Basename. No wallet addresses.",
  },
  {
    title: "Pick a stock.",
    body: "Choose wAAPL, wNVDA, or wTSLA and an amount in tUSDC.",
  },
  {
    title: "They claim in Inbox.",
    body: "The gift lands ready to claim to their embedded Base wallet.",
  },
  {
    title: "Fund with tUSDC.",
    body: "Mint test USDC from Faucet. These are not real Coinbase shares.",
  },
] as const;

export const HOW_IT_WORKS_DEMO_NOTE =
  "Faucet → buy test stock · Gift to a person";

/** Base.dev app id — required for domain verification meta tag */
export const BASE_APP_ID = "6aa042f3227c28e4adffe4ed";

export const TOAST = {
  signInFailed: "Sign in failed — try again",
  codeSent: "Code sent — check your email",
  emailUnlinked: "Email unlinked",
  copied: "Copied",
  signedOut: "Signed out of Wisp",
  signOutFailed: "Couldn’t sign out — try again",
  addressCopyFailed: "Couldn’t copy address",
  signInToManageHandles: "Sign in to manage handles",
  continueLinking: "Continue linking in the provider window",
  linkAccountFailed: "Couldn’t link account — try again",
  unlinkFailed: "Couldn’t unlink — try again",
  keepOneSignIn: "Keep at least one sign-in method on this account",
  googleUnlinked: "Google unlinked",
  xUnlinked: "X unlinked",
  giftSent: "Gift sent",
  giftClaimed: "Gift claimed",
  faucetMinted: "Test USDC minted",
  walletLinked: "Wallet linked",
} as const;
