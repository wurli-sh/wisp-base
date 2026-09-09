"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StockIcon } from "@/components/StockIcon";
import type { StockMeta } from "@/lib/stocks";

type Props = {
  stock: StockMeta;
  amountLabel: string;
  usdLabel?: string;
  senderLabel?: string;
  message?: string | null;
  status?: string;
  className?: string;
  compact?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
};

export function GiftCard({
  stock,
  amountLabel,
  usdLabel,
  senderLabel,
  message,
  status = "ready to claim",
  className,
  compact = false,
  footer,
  children,
}: Props) {
  return (
    <div className={cn("relative z-0 mx-auto w-full max-w-[420px]", className)} data-testid="gift-card">
      <div
        className={cn(
          "radius-surface overflow-hidden border border-border/70 bg-card shadow-card",
          footer ? "p-2" : "p-0",
        )}
      >
        <div
          className={cn(
            "relative isolate overflow-hidden rounded-[calc(var(--radius-surface)-0.35rem)] bg-brand text-white",
            compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,oklch(1_0_0/0.2),transparent_55%),radial-gradient(ellipse_at_100%_100%,oklch(0.45_0.14_260/0.45),transparent_50%)]"
          />
          <div className="relative z-10 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/sable-logo-light.svg"
                  alt=""
                  className={cn("w-auto", compact ? "h-4 sm:h-5" : "h-5 sm:h-6")}
                />
                <div className="text-left">
                  <p className={cn("font-semibold tracking-tight", compact ? "text-xs sm:text-sm" : "text-sm")}>
                    Wisp
                  </p>
                  <p className="text-[11px] font-medium text-white/70">Stock gift · TEST</p>
                </div>
              </div>
              {status ? (
                <span className="inline-flex max-w-[10.5rem] shrink-0 items-center justify-center rounded-md border border-white/25 bg-white/20 px-2.5 py-1.5 text-center text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-white">
                  {status}
                </span>
              ) : null}
            </div>

            <div className={cn("flex items-center gap-3", compact ? "mt-4" : "mt-5")}>
              <StockIcon stock={stock} size="lg" />
              <div className="text-left">
                <p className={cn("font-bold tracking-tight", compact ? "text-3xl" : "text-3xl sm:text-4xl")}>
                  {amountLabel}
                </p>
                <p className="text-sm font-medium text-white/80">
                  {stock.symbol}
                  {usdLabel ? ` · ~${usdLabel} at send` : ""}
                </p>
              </div>
            </div>

            {senderLabel ? (
              <p className="mt-4 text-left text-xs text-white/75">From {senderLabel}</p>
            ) : null}
            {message ? (
              <p className="mt-2 line-clamp-3 text-left text-sm text-white/90">{message}</p>
            ) : null}
            {children}
          </div>
        </div>
        {footer ? <div className="px-1 pb-1 pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}
