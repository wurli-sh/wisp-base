"use client";

import { cn } from "@/lib/cn";
import { TextShimmer } from "@/components/ui/TextShimmer";

export type ProgressStage = {
  id: string;
  label: string;
};

type Props = {
  stages: ProgressStage[];
  current: string;
  className?: string;
};

export function TransactionProgress({ stages, current, className }: Props) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => s.id === current),
  );
  return (
    <ol className={cn("space-y-2", className)} aria-label="Transaction progress">
      {stages.map((stage, index) => {
        const done = index < currentIndex || current === "complete";
        const active = stage.id === current && current !== "complete";
        return (
          <li
            key={stage.id}
            className={cn(
              "radius-surface-inner flex items-center gap-3 border px-3 py-2.5 text-sm",
              active
                ? "border-brand/30 bg-brand-mist text-brand-ink"
                : done
                  ? "border-border/60 bg-card text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md text-[11px] font-bold",
                active || done ? "bg-brand text-brand-foreground" : "bg-selection text-selection-foreground",
              )}
            >
              {done && !active ? "✓" : index + 1}
            </span>
            {active ? <TextShimmer>{stage.label}</TextShimmer> : <span>{stage.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
