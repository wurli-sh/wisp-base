"use client";

import { HOW_IT_WORKS_STEPS } from "@/lib/brand-copy";

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-10 text-left" aria-labelledby="how-it-works">
      <h2
        id="how-it-works"
        className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
      >
        How it works
      </h2>
      <ol className="grid gap-4 sm:grid-cols-2">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="radius-surface border border-border bg-card p-5 shadow-card sm:p-6"
          >
            <p className="text-xs font-semibold tracking-widest text-brand">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
