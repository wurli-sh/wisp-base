import Link from "next/link";
import { ArrowRight, BadgeCheck, Coins, Gift, WalletCards } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";

const STEPS = [
  {
    icon: WalletCards,
    title: "Set up your wallet",
    body: "Sign in and link your embedded Base Sepolia smart wallet. Gas is sponsored when CDP Paymaster is enabled.",
  },
  {
    icon: Coins,
    title: "Mint demo funds",
    body: "Use Faucet to mint tUSDC, then choose a Wisp test stock and amount to gift.",
  },
  {
    icon: Gift,
    title: "Send a gift",
    body: "Choose a Wisp handle, email, or Basename. Gifts settle through the Wisp escrow on Base Sepolia.",
  },
  {
    icon: BadgeCheck,
    title: "Claim or refund",
    body: "Recipients claim after unlock. Unclaimed expired gifts can be refunded by the sender.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <PageShell
      title="How Wisp works"
      subtitle="A simple testnet flow for sending and claiming Wisp test-stock gifts on Base Sepolia."
    >
      <div className="mx-auto max-w-2xl space-y-4">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <article
            key={title}
            className="radius-surface-inner flex gap-4 border border-border/70 bg-card p-4 shadow-soft sm:p-5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-brand-muted bg-brand-mist text-brand-ink">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand">Step {index + 1}</p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
        <Button href="/faucet">Get test USDC</Button>
        <Button href="/send" variant="secondary">
          Send a gift <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
        Wisp stocks and tUSDC are test assets only, not real securities or real USDC.
      </p>
    </PageShell>
  );
}
