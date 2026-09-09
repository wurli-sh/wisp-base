"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Check, ChevronDown, Copy, LogOut, Mail, Wallet } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { SignInModal } from "@/components/SignInModal";
import { GoogleIcon, XBrandIcon } from "@/components/icons";
import {
  AUTH_SESSION_EVENT,
  fetchMe,
  signOut,
  syncWispSession,
  type MeResponse,
} from "@/lib/auth";
import { TOAST } from "@/lib/brand-copy";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format/amount";
import { buttonTap } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import { useWispWallet } from "@/lib/wallet";

const NAV_LINKS = [
  ["/send", "Send"],
  ["/inbox", "Inbox"],
  ["/faucet", "Faucet"],
  ["/account", "Account"],
] as const;

type AuthProviderKind = "google" | "x" | "email";

function resolveAuthProviders(session: Session): AuthProviderKind[] {
  const identities = session.user.identities ?? [];
  const found = new Set<AuthProviderKind>();
  for (const identity of identities) {
    const provider = identity.provider;
    if (provider === "google") found.add("google");
    else if (provider === "twitter" || provider === "x") found.add("x");
    else if (provider === "email") found.add("email");
  }
  const meta = session.user.app_metadata?.provider;
  if (meta === "google") found.add("google");
  if (meta === "twitter" || meta === "x") found.add("x");
  if (meta === "email") found.add("email");
  if (found.size === 0 && session.user.email) found.add("email");
  return (["google", "x", "email"] as const).filter((k) => found.has(k));
}

function AuthProviderMark({
  kind,
  className,
}: {
  kind: AuthProviderKind;
  className?: string;
}) {
  if (kind === "google") return <GoogleIcon className={className} />;
  if (kind === "x") return <XBrandIcon className={className} />;
  return <Mail className={className} aria-hidden />;
}

function authLabel(kind: AuthProviderKind): string {
  if (kind === "google") return "Google";
  if (kind === "x") return "X";
  return "Email";
}

export function IslandNav() {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const wallet = useWispWallet();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastSessionToken = useRef<string | null | undefined>(undefined);

  async function refreshMe() {
    const res = await fetchMe();
    if (res.ok) setMe(res.data);
    else setMe(null);
  }

  async function onSessionEstablished() {
    await syncWispSession();
    await refreshMe();
  }

  useEffect(() => {
    try {
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data }) => {
        lastSessionToken.current = data.session?.access_token ?? null;
        setSession(data.session);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        const token = s?.access_token ?? null;
        if (lastSessionToken.current === token) return;
        lastSessionToken.current = token;
        setSession(s);
      });
      return () => sub.subscription.unsubscribe();
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (session) void onSessionEstablished();
    else setMe(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    function onSession() {
      if (session) void refreshMe();
    }
    window.addEventListener(AUTH_SESSION_EVENT, onSession);
    return () => window.removeEventListener(AUTH_SESSION_EVENT, onSession);
  }, [session]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function disconnectAuth() {
    setBusy(true);
    setMenuOpen(false);
    try {
      await signOut();
      setMe(null);
      setSession(null);
      toast.success(TOAST.signedOut);
    } catch {
      toast.error(TOAST.signOutFailed);
    } finally {
      setBusy(false);
    }
    setSignInOpen(true);
    router.replace("/");
    router.refresh();
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 1_800);
    } catch {
      setCopiedAddress(null);
      toast.error(TOAST.addressCopyFailed);
    }
  }

  const authKinds = session ? resolveAuthProviders(session) : [];
  const primaryAuth = authKinds[0] ?? "email";
  const linkedAddress = me?.wallet?.address ?? wallet.address ?? null;

  const xHandle =
    (session?.user.user_metadata?.user_name as string | undefined) ??
    (session?.user.user_metadata?.preferred_username as string | undefined) ??
    me?.identities.find((identity) => identity.provider === "x")?.normalized_identifier;
  const emailIdentity = me?.identities.find(
    (identity) => identity.provider === "email" || identity.provider === "google",
  )?.normalized_identifier;
  const accountSubtitle =
    primaryAuth === "x" && xHandle
      ? `@${String(xHandle).replace(/^@/, "")}`
      : (session?.user.email ??
        emailIdentity ??
        (xHandle ? `@${xHandle}` : "Signed in"));

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div className="radius-control pointer-events-auto grid w-full max-w-xl origin-top grid-cols-[1fr_auto_1fr] items-center bg-nav px-4 py-3.5 text-nav-foreground shadow-md shadow-primary/10 sm:max-w-2xl sm:px-6">
          <Link href="/" className="justify-self-start pl-1 sm:pl-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sable-logo-light.svg"
              alt="Wisp"
              className="h-5 w-auto"
              data-testid="brand-logo"
            />
          </Link>

          <LayoutGroup id="primary-navigation">
            <nav
              className="flex items-center justify-center gap-0.5 sm:gap-1"
              aria-label="Primary"
            >
              {NAV_LINKS.map(([href, label]) => {
                const active =
                  pathname === href ||
                  pathname.startsWith(`${href}/`) ||
                  (href === "/send" &&
                    (pathname === "/claim" ||
                      pathname.startsWith("/claim/") ||
                      pathname === "/c"));
                return (
                  <Link
                    key={href}
                    href={href}
                    data-testid={`nav-${label.toLowerCase()}`}
                    className={cn(
                      "radius-control relative px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-nav sm:px-4 sm:text-sm",
                      active
                        ? "text-nav-foreground"
                        : "text-nav-foreground/75 hover:bg-nav-hover hover:text-nav-foreground",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="tab-panel"
                        initial={false}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 360, damping: 36 }
                        }
                        className="radius-control absolute inset-0 bg-nav-active"
                      />
                    ) : null}
                    <span className="relative z-10">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </LayoutGroup>

          <div className="justify-self-end pr-1 sm:pr-2">
            {session ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls="account-menu"
                  aria-label="Account menu"
                  onClick={() => setMenuOpen((o) => !o)}
                  className={cn(
                    "radius-control flex cursor-pointer items-center gap-1.5 bg-nav-hover py-1 pl-1 pr-1.5 text-xs font-medium text-nav-foreground/80 transition-[background-color,color] duration-300 hover:bg-nav-active hover:text-nav-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-nav sm:pr-2",
                    menuOpen && "bg-nav-active text-nav-foreground",
                  )}
                >
                  <span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                    <AuthProviderMark
                      kind={primaryAuth}
                      className="size-3.5 text-nav-foreground"
                    />
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 opacity-70 transition-transform duration-150",
                      menuOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {menuOpen ? (
                  <section
                    id="account-menu"
                    aria-label="Account menu"
                    className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card"
                  >
                    <div className="bg-brand-mist/55 px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-brand-muted/70">
                          <AuthProviderMark
                            kind={primaryAuth}
                            className="size-4 text-brand-ink"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            Signed in with {authLabel(primaryAuth)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {accountSubtitle}
                          </p>
                        </div>
                      </div>
                      {authKinds.length > 1 ? (
                        <p className="mt-2.5 text-xs text-muted-foreground">
                          Also linked:{" "}
                          {authKinds
                            .filter((k) => k !== primaryAuth)
                            .map(authLabel)
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="border-t border-border/60 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Embedded wallet
                        </p>
                      </div>
                      {linkedAddress ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/60 p-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/chains/base.svg"
                            alt="Base"
                            width={20}
                            height={20}
                            className="size-5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              Base Sepolia
                            </p>
                            <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                              {shortenAddress(linkedAddress, 4)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyAddress(linkedAddress)}
                            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label={
                              copiedAddress === linkedAddress
                                ? "Wallet address copied"
                                : "Copy Base wallet address"
                            }
                          >
                            {copiedAddress === linkedAddress ? (
                              <Check className="size-4 text-success" aria-hidden />
                            ) : (
                              <Copy className="size-4" aria-hidden />
                            )}
                          </button>
                        </div>
                      ) : (
                        <Link
                          href="/account?tab=wallet"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl border border-dashed border-border/80 bg-background/40 p-2.5 text-left transition-colors hover:bg-muted"
                        >
                          <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">
                              Link Base wallet
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Required before claim
                            </p>
                          </div>
                        </Link>
                      )}
                    </div>

                    <div className="border-t border-border/60 p-2">
                      <button
                        type="button"
                        data-testid="sign-out"
                        disabled={busy}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => void disconnectAuth()}
                      >
                        <LogOut
                          className="size-3.5 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="flex-1 text-left">Sign out</span>
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
            {session === null ? (
              <motion.div whileTap={reduce ? undefined : buttonTap}>
                <button
                  data-motion-button
                  data-testid="sign-in"
                  type="button"
                  onClick={() => setSignInOpen(true)}
                  className="radius-control cursor-pointer bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground shadow-action transition-colors duration-100 ease-out hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-nav disabled:opacity-50"
                >
                  Sign in
                </button>
              </motion.div>
            ) : null}
            {session === undefined ? (
              <span className="radius-control block size-8 animate-pulse bg-nav-hover" />
            ) : null}
          </div>
        </div>
      </header>
      <SignInModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => {
          void createClient()
            .auth.getSession()
            .then(({ data }) => setSession(data.session));
          void refreshMe();
        }}
      />
    </>
  );
}
