"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { navSpring } from "@/lib/motion";

const NAV_LINKS = [
  ["/send", "Send"],
  ["/inbox", "Inbox"],
  ["/faucet", "Faucet"],
  ["/account", "Account"],
] as const;

export function IslandNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="radius-control pointer-events-auto grid w-full max-w-lg origin-top grid-cols-[1fr_auto_1fr] items-center bg-nav px-4 py-3.5 text-nav-foreground shadow-md shadow-primary/10 sm:max-w-xl sm:px-6">
        <Link href="/" className="justify-self-start pl-1 sm:pl-2">
          <img src="/wisp-logo.svg" alt="Wisp" className="h-5 w-auto brightness-0 invert" />
        </Link>
        <LayoutGroup>
          <nav className="flex items-center justify-center gap-0.5 sm:gap-1">
            {NAV_LINKS.map(([href, label]) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "radius-control relative px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-nav sm:px-4 sm:text-sm",
                    active
                      ? "text-nav-foreground"
                      : "text-nav-foreground/75 hover:bg-nav-hover hover:text-nav-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={reduceMotion ? undefined : "nav-pill"}
                      className="absolute inset-0 rounded-[inherit] bg-nav-active"
                      transition={navSpring}
                    />
                  ) : null}
                  <span className="relative z-10">{label}</span>
                </Link>
              );
            })}
          </nav>
        </LayoutGroup>
        <div className="justify-self-end pr-1 sm:pr-2" />
      </div>
    </header>
  );
}
