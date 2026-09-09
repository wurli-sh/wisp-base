export { formatUsdcRaw, formatStockAmount, formatUsdFromE6, usdDollarsToUsdcRaw } from "@/lib/stocks";

export function shortenAddress(address: string, size = 4): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return address;
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function baseScanTx(txHash: string, chainId = 84532): string {
  const host = chainId === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
  return `${host}/tx/${txHash}`;
}

export function baseScanAddress(address: string, chainId = 84532): string {
  const host = chainId === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
  return `${host}/address/${address}`;
}
