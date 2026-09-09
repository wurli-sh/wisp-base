export type StockKey = "WISPAAPL" | "WISPNVDA" | "WISPTSLA";

export type StockMeta = {
  key: StockKey;
  symbol: string;
  name: string;
  iconPath: string;
  /** Fallback USD price in e6 if registry unavailable (from deployment). */
  defaultUsdPriceE6: bigint;
  letter: string;
  tint: string;
};

export const STOCKS: readonly StockMeta[] = [
  {
    key: "WISPAAPL",
    symbol: "wAAPL",
    name: "Wisp Test Apple",
    iconPath: "/stocks/aapl.svg",
    defaultUsdPriceE6: 316_000_000n,
    letter: "A",
    tint: "#555555",
  },
  {
    key: "WISPNVDA",
    symbol: "wNVDA",
    name: "Wisp Test NVIDIA",
    iconPath: "/stocks/nvda.svg",
    defaultUsdPriceE6: 225_000_000n,
    letter: "N",
    tint: "#76B900",
  },
  {
    key: "WISPTSLA",
    symbol: "wTSLA",
    name: "Wisp Test Tesla",
    iconPath: "/stocks/tsla.svg",
    defaultUsdPriceE6: 367_000_000n,
    letter: "T",
    tint: "#CC0000",
  },
] as const;

export const AMOUNT_CHIPS_USD = [10, 25, 50, 100] as const;

export function stockByKey(key: string): StockMeta | undefined {
  return STOCKS.find((s) => s.key === key);
}

export function stockBySymbol(symbol: string): StockMeta | undefined {
  const n = symbol.trim().toLowerCase();
  return STOCKS.find((s) => s.symbol.toLowerCase() === n);
}

/** Format USD cents/e6-style dollars without floating point in the critical path. */
export function formatUsdFromE6(usdE6: bigint): string {
  const whole = usdE6 / 1_000_000n;
  const frac = usdE6 % 1_000_000n;
  if (frac === 0n) return `$${whole.toString()}`;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `$${whole.toString()}.${fracStr}`;
}

export function usdDollarsToUsdcRaw(dollars: string): bigint | null {
  const trimmed = dollars.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [w, f = ""] = trimmed.split(".");
  const whole = BigInt(w);
  const frac = BigInt(f.padEnd(2, "0").slice(0, 2));
  return whole * 1_000_000n + frac * 10_000n;
}

export function formatUsdcRaw(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

/** quote = usdcRaw * 1e18 / usdPriceE6 (18-decimal stock). */
export function quoteStockAmount(usdcRaw: bigint, usdPriceE6: bigint): bigint {
  if (usdPriceE6 === 0n) return 0n;
  return (usdcRaw * 10n ** 18n) / usdPriceE6;
}

export function formatStockAmount(raw: bigint, maxFrac = 6): string {
  const whole = raw / 10n ** 18n;
  const frac = raw % 10n ** 18n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}

export function formatUsdPriceLabel(usdPriceE6: bigint): string {
  return formatUsdFromE6(usdPriceE6);
}
