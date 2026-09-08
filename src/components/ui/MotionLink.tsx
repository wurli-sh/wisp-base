"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { buttonTap } from "@/lib/motion";

function motionStyles(variant: "brand" | "outline") {
  return variant === "brand"
    ? "bg-brand text-brand-foreground shadow-action hover:bg-brand-dark"
    : "border-2 border-border bg-card text-foreground hover:border-border-strong";
}

export function MotionButton({
  children,
  className,
  variant = "outline",
  type = "button",
  disabled = false,
  onClick,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "brand" | "outline";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick: () => void;
  "data-testid"?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      whileTap={reduce || disabled ? undefined : buttonTap}
      className="inline-flex"
    >
      <button
        data-motion-button
        data-testid={testId}
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "radius-control inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50",
          motionStyles(variant),
          className,
        )}
      >
        {children}
      </button>
    </motion.div>
  );
}
