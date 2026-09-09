import { PageShell } from "@/components/PageShell";

const POINTS = [
  "Email and X identifiers are not placed onchain.",
  "Wisp Inbox is authenticated — only you see gifts addressed to your identities.",
  "Anonymous mode hides the sender name only in the Wisp UI.",
  "Sender address, escrow interaction, claim wallet, timing, and token transfers remain visible on Base.",
  "The backend authorizes claim only to your verified embedded wallet.",
  "Demo assets are Wisp test stocks and tUSDC — not real securities.",
] as const;

export default function PrivacyPage() {
  return (
    <PageShell
      title="Privacy"
      subtitle="What Wisp hides — and what Base still makes public."
    >
      <div className="space-y-4 text-sm leading-relaxed text-foreground">
        <p className="text-muted-foreground">
          Wisp Base does not use private settlement or ZK claims. Gifts settle as public token
          transfers on Base Sepolia.
        </p>
        <ul className="space-y-3">
          {POINTS.map((point) => (
            <li
              key={point}
              className="radius-surface-inner border border-border/70 bg-card px-4 py-3 shadow-soft"
            >
              {point}
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
