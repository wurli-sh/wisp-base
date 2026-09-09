"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { buttonTap } from "@/lib/motion";
import { AMOUNT_CHIPS_USD } from "@/lib/stocks";

type Props = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
};

export function StockAmountInput({ value, onChange, className }: Props) {
  const reduce = useReducedMotion();
  const numeric = Number(value);
  return (
    <div className={cn("space-y-3", className)}>
      <label className="block text-sm font-medium text-foreground" htmlFor="gift-usd">
        USD amount
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AMOUNT_CHIPS_USD.map((chip) => {
          const active = numeric === chip && !value.includes(".");
          return (
            <motion.button
              key={chip}
              data-motion-button
              type="button"
              whileTap={reduce ? undefined : buttonTap}
              onClick={() => onChange(String(chip))}
              className={cn(
                "radius-control min-h-11 border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-brand-dark bg-gradient-to-b from-[#4788f5] to-brand text-brand-foreground shadow-action"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              ${chip}
            </motion.button>
          );
        })}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <input
          id="gift-usd"
          data-testid="usd-amount"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.]/g, "");
            onChange(next);
          }}
          className="radius-control h-12 w-full border border-border bg-card pl-8 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Custom amount"
        />
      </div>
    </div>
  );
}
