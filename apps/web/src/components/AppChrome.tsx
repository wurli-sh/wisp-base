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
            className="flex min-h-10 items-center gap-2 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sable-logo.svg" alt="" className="h-4 w-auto" />
            <span className="text-sm font-bold tracking-tight text-foreground">Wisp</span>
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex min-h-10 items-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            How it works
          </Link>
        </footer>
      ) : null}
    </>
  );
}
