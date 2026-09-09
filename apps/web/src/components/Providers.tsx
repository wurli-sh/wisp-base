"use client";

import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { SessionSync } from "@/components/SessionSync";
import { WalletProvider } from "@/lib/wallet/WalletProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <CanonicalDevelopmentOrigin />
      <SessionSync />
      {children}
      <Toaster
        position="top-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "max-w-sm rounded-md border-border bg-card text-sm text-foreground shadow-card",
            title: "text-sm font-medium",
            description: "text-xs",
          },
          duration: 4500,
        }}
      />
    </WalletProvider>
  );
}

/** Keep local CDP requests on the exact origin allowlisted in the Portal. */
function CanonicalDevelopmentOrigin() {
  useEffect(() => {
    if (window.location.hostname !== "127.0.0.1") return;
    const url = new URL(window.location.href);
    url.hostname = "localhost";
    window.location.replace(url.toString());
  }, []);

  return null;
}
