"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, Send, Wallet } from "lucide-react";
import { GiftCard } from "@/components/GiftCard";
import { StockIcon } from "@/components/StockIcon";
import { HOW_IT_WORKS_DEMO_NOTE, HOW_IT_WORKS_STEPS } from "@/lib/brand-copy";
import { STOCKS, stockByKey } from "@/lib/stocks";

const HANDLE = "@patlu";
const PICKED = "WISPAAPL" as const;
const DEMO_AMOUNT = "0.03";
const DEMO_USD = "$10";

const STEPS = HOW_IT_WORKS_STEPS;
type DemoStep = 0 | 1 | 2 | 3;

const pickedStock = stockByKey(PICKED)!;

function FaucetPreview() {
  return (
    <div className="radius-surface w-full overflow-hidden border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-muted bg-brand-soft text-brand-ink">
            <Droplets className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">Get test USDC</p>
            <p className="text-sm text-muted-foreground">Base Sepolia faucet · tUSDC</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
          Testnet only
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-border/70 bg-muted/35 p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Mint amount</span>
          <span className="font-semibold tabular-nums">100 tUSDC</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/80">
          <div className="h-full w-2/3 rounded-full bg-brand" />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Use faucet tUSDC to buy test stocks, then gift them to a handle or email.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          Embedded Base wallet
        </span>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
        {HOW_IT_WORKS_DEMO_NOTE}
      </p>
    </div>
  );
}

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const [chars, setChars] = useState(0);
  const [stockOn, setStockOn] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [cardIn, setCardIn] = useState(false);
  const [faucetIn, setFaucetIn] = useState(false);
  const [active, setActive] = useState<DemoStep>(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) =>
    timers.current.push(setTimeout(fn, ms));

  const play = (from: DemoStep) => {
    clear();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setChars(HANDLE.length);
      setStockOn(true);
      setPressed(false);
      setCardIn(true);
      setFaucetIn(true);
      setActive(3);
      return;
    }

    const stepHold = 2000;

    const showStep0 = (t: number) => {
      at(t, () => {
        setChars(0);
        setStockOn(false);
        setPressed(false);
        setCardIn(false);
        setFaucetIn(false);
        setActive(0);
      });
      for (let i = 1; i <= HANDLE.length; i++) {
        at(t + 300 + i * 120, () => setChars(i));
      }
    };

    const showStep1 = (t: number) => {
      at(t, () => {
        setChars(HANDLE.length);
        setStockOn(false);
        setPressed(false);
        setCardIn(false);
        setFaucetIn(false);
        setActive(1);
      });
      at(t + 300, () => setStockOn(true));
      at(t + 1100, () => setPressed(true));
      at(t + 1350, () => setPressed(false));
    };

    const showStep2 = (t: number) => {
      at(t, () => {
        setChars(HANDLE.length);
        setStockOn(true);
        setPressed(false);
        setCardIn(false);
        setFaucetIn(false);
        setActive(2);
      });
      at(t + 150, () => setCardIn(true));
    };

    const showStep3 = (t: number) => {
      at(t, () => {
        setChars(HANDLE.length);
        setStockOn(true);
        setPressed(false);
        setCardIn(true);
        setActive(3);
      });
      at(t + 150, () => setFaucetIn(true));
    };

    const sequence = [showStep0, showStep1, showStep2, showStep3] as const;
    for (let step = from; step <= 3; step++) {
      sequence[step]((step - from) * stepHold);
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          play(0);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typed = HANDLE.slice(0, chars);

  return (
    <section
      ref={ref}
      className="flex min-h-screen w-full flex-col justify-center"
    >
      <h2 className="text-left text-3xl font-bold tracking-tight sm:text-4xl">
        How it works.
      </h2>

      <div className="mt-12 grid gap-12 text-left md:grid-cols-[300px_1fr] md:items-center">
        <div className="relative pl-6">
          <div className="absolute left-0 top-0 h-full w-px bg-border" />
          <div
            className="absolute left-0 top-0 w-px bg-primary transition-[height] duration-500 motion-reduce:transition-none"
            style={{ height: `${((active + 1) / STEPS.length) * 100}%` }}
          />
          <ol className="space-y-8 sm:space-y-10">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <button
                  type="button"
                  onClick={() => play(i as DemoStep)}
                  className={`min-h-10 cursor-pointer text-left transition-opacity duration-300 motion-reduce:transition-none hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ${
                    i === active ? "opacity-100" : "opacity-40"
                  }`}
                >
                  <p className="text-sm text-muted-foreground">0{i + 1}</p>
                  <p className="mt-1 text-xl font-semibold">{step.title}</p>
                  <p className="mt-2 text-muted-foreground">{step.body}</p>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div
          className="flex flex-col items-center justify-center gap-10"
          aria-hidden
        >
          <div
            className={`flex flex-col items-center gap-5 transition-opacity duration-300 ${
              active >= 2 ? "opacity-35" : "opacity-100"
            }`}
          >
            <div className="flex w-full max-w-md items-center gap-2 sm:w-auto sm:max-w-none">
              <span className="radius-control flex min-w-0 flex-1 items-center border-2 border-border bg-card px-5 py-3.5 text-lg sm:min-w-[340px] sm:flex-none">
                {typed ? (
                  <span className="truncate">{typed}</span>
                ) : (
                  <span className="truncate text-muted-foreground/60">
                    @handle or email
                  </span>
                )}
                <span
                  className={`ml-0.5 inline-block h-6 w-0.5 shrink-0 bg-primary ${
                    active >= 2 ? "opacity-0" : "animate-pulse"
                  }`}
                />
              </span>
              <span
                className={`radius-control inline-flex shrink-0 items-center justify-center gap-2 border-2 border-brand-dark bg-brand px-6 py-3 text-base font-semibold text-brand-foreground shadow-action transition-transform duration-200 sm:px-7 ${
                  pressed ? "scale-90" : "scale-100"
                }`}
              >
                <Send className="h-4 w-4" aria-hidden />
                Send
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                className={`radius-control inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] duration-300 motion-reduce:transition-none ${
                  stockOn
                    ? "scale-105 border-brand-muted bg-brand-soft text-brand-ink"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <StockIcon stock={pickedStock} size="sm" />
                {pickedStock.symbol}
              </span>
              <span
                className={`radius-control inline-flex items-center gap-1.5 border px-3 py-2 text-sm font-medium transition-[color,background-color,border-color] duration-300 motion-reduce:transition-none ${
                  stockOn
                    ? "border-primary/40 bg-card text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {DEMO_AMOUNT}
                <span className="text-xs text-muted-foreground">≈ {DEMO_USD}</span>
              </span>
              {STOCKS.filter((s) => s.key !== PICKED).map((s) => (
                <span
                  key={s.key}
                  className="radius-control inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground opacity-50"
                >
                  <StockIcon stock={s} size="sm" />
                  {s.symbol}
                </span>
              ))}
            </div>
          </div>

          <div className="relative min-h-[330px] w-[420px] max-w-full sm:w-[440px]">
            <div
              className={`absolute inset-x-0 top-0 transition-[opacity,transform] duration-400 ease-out motion-reduce:transition-none ${
                cardIn && active !== 3
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
            >
              <GiftCard
                stock={pickedStock}
                amountLabel={DEMO_AMOUNT}
                usdLabel={DEMO_USD}
                senderLabel="you"
                message="Happy birthday — claim in Wisp Inbox"
                status="ready to claim"
                compact
              />
            </div>
            <div
              className={`absolute inset-x-0 top-0 transition-[opacity,transform] duration-400 ease-out motion-reduce:transition-none ${
                faucetIn && active === 3
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
            >
              <FaucetPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
