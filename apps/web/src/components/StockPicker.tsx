"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { buttonTap } from "@/lib/motion";
import { StockIcon } from "@/components/StockIcon";
import {
  STOCKS,
  formatUsdPriceLabel,
  type StockKey,
  type StockMeta,
} from "@/lib/stocks";

type Props = {
  value: StockKey;
  onChange: (key: StockKey) => void;
  stocks?: readonly StockMeta[];
  prices?: Partial<Record<StockKey, bigint>>;
  className?: string;
};

export function StockPicker({
  value,
  onChange,
  stocks = STOCKS,
  prices,
  className,
}: Props) {
  const reduce = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label="Choose stock"
      className={cn("grid grid-cols-3 gap-2", className)}
    >
      {stocks.map((stock) => {
        const selected = stock.key === value;
        const price = prices?.[stock.key] ?? stock.defaultUsdPriceE6;
        return (
          <motion.button
            key={stock.key}
            data-motion-button
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`stock-${stock.symbol}`}
            whileTap={reduce ? undefined : buttonTap}
            onClick={() => onChange(stock.key)}
            className={cn(
              "radius-surface-inner flex flex-col items-start gap-2 border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-brand bg-card shadow-soft"
                : "border-border/70 bg-card/70 hover:bg-muted/60",
            )}
          >
            <div className="flex w-full items-center justify-between gap-1">
              <StockIcon stock={stock} size="md" />
              <span className="rounded-sm bg-brand-mist px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-ink ring-1 ring-brand-muted">
                Test
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{stock.symbol}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatUsdPriceLabel(price)}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
