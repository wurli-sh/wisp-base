"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IslandNav } from "@/components/IslandNav";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showLandingFooter = pathname === "/";

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 app-atmosphere" aria-hidden />
      <IslandNav />
      <main className="mx-auto min-h-svh max-w-5xl px-4 pb-12 pt-28">{children}</main>
      {showLandingFooter ? (
        <footer className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pb-10 text-sm text-muted-foreground">
          <Link
            href="/"
            className="flex min-h-10 items-center gap-2 opacity-70 transition-opacity hover:opacity-100"
          >
            <img src="/wisp-logo.svg" alt="" className="h-4 w-auto brightness-0" />
            <span className="text-sm font-bold tracking-tight text-foreground">Wisp</span>
          </Link>
          <span className="text-xs">Coinbase stocks on Base</span>
        </footer>
      ) : null}
    </>
  );
}
