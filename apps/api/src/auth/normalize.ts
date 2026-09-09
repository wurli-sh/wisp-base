export function normalizeIdentifier(provider: "email" | "google" | "x", value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!normalized || normalized.length > 320) throw new Error("invalid_identifier");
  if (provider === "email" || provider === "google") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("invalid_identifier");
    return normalized;
  }
  const handle = normalized.replace(/^@/, "");
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("invalid_identifier");
  return handle;
}
