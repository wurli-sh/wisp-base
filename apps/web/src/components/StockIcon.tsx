"use client";

import { cn } from "@/lib/cn";
import type { StockMeta } from "@/lib/stocks";

type Props = {
  stock: StockMeta;
  size?: "sm" | "md" | "lg";
  showTest?: boolean;
  className?: string;
};

const SIZES = { sm: "size-5", md: "size-8", lg: "size-10" } as const;

export function StockIcon({ stock, size = "md", showTest = false, className }: Props) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stock.iconPath}
        alt=""
        className={cn("rounded-md", SIZES[size])}
      />
      {showTest ? (
        <span className="absolute -bottom-1 -right-1 rounded-sm bg-brand-mist px-1 text-[8px] font-bold uppercase tracking-wide text-brand-ink ring-1 ring-brand-muted">
          Test
        </span>
      ) : null}
    </span>
  );
}
