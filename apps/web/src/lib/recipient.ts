export type RecipientKind = "email" | "x" | "basename";

export type ParsedRecipient =
  | { ok: true; kind: RecipientKind; identifier: string }
  | { ok: false; reason: "empty" | "address" | "invalid" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const X_RE = /^@[A-Za-z0-9_]{1,15}$/;
const BASENAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.base\.eth$/i;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function parseRecipient(raw: string): ParsedRecipient {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "empty" };
  if (ADDRESS_RE.test(value)) return { ok: false, reason: "address" };
  if (EMAIL_RE.test(value)) {
    return { ok: true, kind: "email", identifier: value.toLowerCase() };
  }
  if (X_RE.test(value) || /^[A-Za-z0-9_]{1,15}$/.test(value)) {
    const handle = value.startsWith("@") ? value : `@${value}`;
    if (!X_RE.test(handle)) return { ok: false, reason: "invalid" };
    return { ok: true, kind: "x", identifier: handle.toLowerCase() };
  }
  if (BASENAME_RE.test(value)) {
    return { ok: true, kind: "basename", identifier: value.toLowerCase() };
  }
  return { ok: false, reason: "invalid" };
}
