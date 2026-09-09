export function userFacingError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) {
    return mapErrorCode(error.trim(), fallback);
  }
  if (error instanceof Error && error.message.trim()) {
    const cdpMessage =
      "errorMessage" in error &&
      typeof (error as { errorMessage?: unknown }).errorMessage === "string"
        ? String((error as { errorMessage: string }).errorMessage).trim()
        : "";
    const errorType =
      "errorType" in error && typeof (error as { errorType?: unknown }).errorType === "string"
        ? String((error as { errorType: string }).errorType).trim()
        : "";
    const primary = cdpMessage || error.message.trim();
    return mapErrorCode(`${primary}${errorType ? ` ${errorType}` : ""}`.trim(), fallback);
  }
  return fallback;
}

function mapErrorCode(code: string, fallback: string): string {
  const appOrigin = currentAppOrigin();
  const lower = code.toLowerCase();
  const originFromCode = lower.startsWith("cdp_origin_blocked:")
    ? code.slice(code.indexOf(":") + 1).trim()
    : "";
  const blockedOrigin = originFromCode || appOrigin;

  if (lower.startsWith("cdp_origin_blocked")) {
    return `This page origin is not allowlisted in CDP Portal — add ${blockedOrigin} under Embedded Wallet → Domains`;
  }
  if (lower.includes("project config not found")) {
    return "CDP project wallet config is missing — in Portal, re-save Authentication + Domains, or create a fresh Embedded Wallet project and update NEXT_PUBLIC_CDP_PROJECT_ID";
  }
  if (
    lower.includes("insufficient balance to execute") ||
    lower.includes("insufficient funds") ||
    lower.includes("gas required exceeds")
  ) {
    return "Gas sponsorship failed — enable CDP Paymaster on Base Sepolia and allowlist mockUsdc (see .env.example)";
  }
  // Domain allowlist before contract Paymaster allowlist wording.
  if (
    (lower.includes("origin") || lower.includes("domain")) &&
    (lower.includes("allowlist") || lower.includes("whitelist") || lower.includes("not allowed"))
  ) {
    return `This page origin is not allowlisted in CDP Portal — add ${blockedOrigin} under Embedded Wallet → Domains`;
  }
  if (
    lower.includes("paymaster") ||
    lower.includes("sponsorship") ||
    lower.includes("not allowlisted") ||
    lower.includes("allowlist")
  ) {
    return "CDP Paymaster rejected the tx — allowlist mockUsdc / giftEscrow / demoStockRouter + stock tokens on Base Sepolia";
  }
  if (lower.includes("method not allowed") || lower.includes("errorType.:.not_found") || /\bnot_found\b/.test(lower)) {
    return `CDP rejected the wallet call — confirm Custom Auth is saved and Domains include ${appOrigin}`;
  }
  if (lower.includes("missing kid") || lower.includes("invalid jwt") || lower.includes("unauthorized")) {
    return "CDP rejected your Supabase session JWT — sign out/in, then confirm Custom Auth JWKS/issuer/audience";
  }
  if (lower.includes("network error") || lower.includes("failed to fetch") || lower.includes("cors")) {
    return `Could not reach CDP — confirm ${appOrigin} is in the CDP Portal Domains allowlist`;
  }

  const known: Record<string, string> = {
    unauthorized: "Please sign in to continue",
    api_unreachable: "Service temporarily unavailable — try again",
    insufficient_test_usdc: "Not enough test USDC — mint some from Faucet",
    insufficient_gas:
      "Gas sponsorship failed — enable CDP Paymaster for Base Sepolia (allowlist Wisp contracts) or fund a tiny amount of Sepolia ETH",
    transaction_timeout: "Transaction is taking too long — check Paymaster logs in the CDP Portal",
    transaction_reverted: "Onchain transaction reverted — check Paymaster logs / contract allowlist",
    delivery_timeout:
      "Gift confirmed on Base — inbox sync is delayed and will retry automatically",
    faucet_cooldown: "Faucet cooldown active — try again later",
    faucet_amount_too_high: "Amount exceeds faucet max",
    wrong_network: "Switch to Base Sepolia to continue",
    wallet_unavailable: "Could not create your embedded wallet — try again",
    wallet_signature_invalid:
      "Could not verify smart wallet ownership — hard refresh and try Link smart wallet again",
    wallet_already_linked: "That wallet is already linked to another account",
    cdp_not_ready: "Wallet provider is still loading — try again",
    cdp_auth_failed:
      "CDP could not verify your login — enable Custom Auth (Supabase JWKS) in the CDP Portal",
    cdp_network_unavailable: `Could not reach CDP — add ${appOrigin} in CDP Portal → Embedded Wallet → Domains`,
    cdp_origin_blocked: `This page origin is not allowlisted in CDP Portal — add ${appOrigin} under Embedded Wallet → Domains`,
    cdp_method_not_allowed: `CDP rejected the wallet call — confirm Custom Auth is enabled and Domains include ${appOrigin}`,
    cdp_project_config_missing:
      "CDP project wallet config is missing — re-save Portal Auth/Domains or create a new Embedded Wallet project",
    invalid_recipient: "Enter a valid email, @handle, or Basename",
    gift_not_found: "Gift not found",
    gift_locked: "This gift is still locked",
    gift_expired: "This gift has expired",
    mainnet_api_not_configured: "Mainnet is not available",
    testnet_api_not_configured: "API is not configured",
  };
  return known[code] ?? (code.length <= 80 && !code.includes(" ") ? fallback : code.slice(0, 160));
}

/** Keeps browser-only CDP configuration guidance accurate for local, preview, and production builds. */
function currentAppOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || "this app's origin";
}
