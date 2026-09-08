"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { buttonTap } from "@/lib/motion";

type Variant = "brand" | "primary" | "secondary" | "outline";
type Size = "sm" | "md" | "lg";

type Props = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  "data-testid"?: string;
};

const variants: Record<Variant, string> = {
  brand: "bg-brand text-brand-foreground shadow-action hover:bg-brand-dark",
  primary: "bg-primary text-primary-foreground hover:bg-primary-dark",
  secondary: "bg-selection text-selection-foreground hover:bg-selection-hover",
  outline: "border-2 border-border bg-card text-foreground hover:bg-muted",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "brand",
  size = "md",
  className,
  children,
  disabled,
  type = "button",
  onClick,
  "data-testid": testId,
}: Props) {
  const reduce = useReducedMotion();
  const styles = cn(
    "radius-control inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 font-semibold transition-colors duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

  return (
    <motion.button
      data-motion-button
      data-testid={testId}
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled || reduce ? undefined : buttonTap}
      className={styles}
    >
      {children}
    </motion.button>
  );
}
