export const LANDING_HEADLINE = [
  "Gift real stocks.",
  "To people, not addresses.",
] as const;

export const LANDING_SUBHEAD =
  "Swap into Coinbase tokenized stocks on Base, gift to an @handle or email, then they claim and put it to work.";

export const LANDING_INBOX_PROMPT = "Getting a gift? Open your inbox.";

export const SITE_DESCRIPTION =
  "Gift Coinbase tokenized stocks on Base by handle or email — swap, time-lock, claim, earn.";

export const HOW_IT_WORKS_STEPS = [
  {
    title: "Swap into a stock.",
    body: "Buy AAPLc, NVDAc, and more with USDC on Base.",
  },
  {
    title: "Gift a handle or email.",
    body: "No pasting 0x. Optional unlock time for vesting-style gifts.",
  },
  {
    title: "They claim on Base.",
    body: "They open Wisp Inbox, then B20 lands in their wallet.",
  },
  {
    title: "Put it to work.",
    body: "One-click Morpho supply after claim so the gift keeps working.",
  },
] as const;

/** Base.dev app id — required for domain verification meta tag */
export const BASE_APP_ID = "6aa042f3227c28e4adffe4ed";
