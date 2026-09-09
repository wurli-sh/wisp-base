"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HeroSendBox } from "@/components/HeroSendBox";
import { HowItWorks } from "@/components/HowItWorks";
import { GoogleIcon, XBrandIcon } from "@/components/icons";
import { SignInModal } from "@/components/SignInModal";
import { MotionButton } from "@/components/ui/MotionLink";
import {
  LANDING_HEADLINE,
  LANDING_INBOX_PROMPT,
  LANDING_SUBHEAD,
} from "@/lib/brand-copy";

function HomeContent() {
  const [signInOpen, setSignInOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-20 pb-24 text-center">
      <div className="flex min-h-[calc(100svh-7rem)] w-full max-w-3xl flex-col justify-center space-y-7">
        <div className="inline-flex items-center justify-center self-center rounded-md border border-brand-muted bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-ink">
          Base Sepolia · test assets
        </div>
        <div className="space-y-5">
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tighter text-foreground sm:text-7xl">
            <span aria-hidden="true" className="flex flex-col items-center gap-2">
              {LANDING_HEADLINE.map((line, index) => (
                <motion.span
                  key={line}
                  className="block"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.45,
                    delay: reduceMotion ? 0 : index * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {line}
                </motion.span>
              ))}
            </span>
            <span className="sr-only">
              {LANDING_HEADLINE.join(" ")} {LANDING_SUBHEAD}
            </span>
          </h1>
        </div>

        <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
          {LANDING_SUBHEAD}
        </p>

        <div className="flex flex-col items-center gap-5">
          <HeroSendBox />
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">{LANDING_INBOX_PROMPT}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <MotionButton data-testid="cta-account" onClick={() => setSignInOpen(true)}>
                <GoogleIcon className="h-4 w-4" />
                Continue with Google
              </MotionButton>
              <MotionButton onClick={() => setSignInOpen(true)}>
                <XBrandIcon className="h-4 w-4" />
                Continue with X
              </MotionButton>
            </div>
          </div>
        </div>
      </div>

      <HowItWorks />
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}

export default function HomePage() {
  return <HomeContent />;
}
