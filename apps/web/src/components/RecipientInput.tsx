"use client";

import { cn } from "@/lib/cn";
import { parseRecipient } from "@/lib/recipient";

export type RecipientStatus =
  | "idle"
  | "checking"
  | "on_wisp"
  | "basename_resolved"
  | "not_joined"
  | "invalid"
  | "address_rejected"
  | "unavailable";

const STATUS_COPY: Record<RecipientStatus, string> = {
  idle: "Enter an email, @handle, or Basename",
  checking: "Checking…",
  on_wisp: "On Wisp — ready to deliver",
  basename_resolved: "Basename resolved — pending delivery until they join",
  not_joined: "Not on Wisp yet — we'll deliver when they join",
  invalid: "Use a valid email, @handle, or name.base.eth",
  address_rejected: "Raw 0x addresses are not accepted",
  unavailable: "Lookup unavailable — try again",
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  status: RecipientStatus;
  className?: string;
};

export function RecipientInput({ value, onChange, status, className }: Props) {
  const parsed = parseRecipient(value);
  const effective: RecipientStatus =
    !value.trim()
      ? "idle"
      : !parsed.ok && parsed.reason === "address"
        ? "address_rejected"
        : !parsed.ok && parsed.reason === "invalid"
          ? "invalid"
          : status;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor="recipient" className="block text-sm font-medium text-foreground">
        Recipient
      </label>
      <input
        id="recipient"
        data-testid="handle-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="email, @handle, or name.base.eth"
        className="radius-control h-12 w-full border border-border bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        autoComplete="off"
        spellCheck={false}
      />
      {effective !== "invalid" && effective !== "address_rejected" && effective !== "unavailable" ? (
        <p
          className={cn("text-xs", effective === "on_wisp" ? "text-success" : "text-muted-foreground")}
          aria-live="polite"
        >
          {STATUS_COPY[effective]}
        </p>
      ) : null}
    </div>
  );
}
