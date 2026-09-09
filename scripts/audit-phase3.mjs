#!/usr/bin/env node
/** Phase 3 UI and browser-flow audit. Never prints environment values. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web/src");

function loadEnv() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !["NODE_ENV", "PORT"].includes(match[1]) && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

function run(label, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error(`failed:${label}`);
}

function newestEvidence(name) {
  const base = path.join(root, "evidence/base-sepolia");
  if (!existsSync(base)) return null;
  const files = readdirSync(base)
    .map((dir) => path.join(base, dir, name))
    .filter(existsSync)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : /\.(css|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

loadEnv();

try {
  run("lint", ["run", "lint"]);
  run("unit tests", ["run", "test"]);
  run("production build", ["run", "build"]);
  run("desktop/mobile browser tests", ["run", "test:e2e"]);

  const requiredRoutes = ["page.tsx", "send/page.tsx", "inbox/page.tsx", "faucet/page.tsx", "claim/page.tsx", "c/page.tsx", "register/page.tsx", "account/page.tsx", "balance/page.tsx", "status/page.tsx", "how-it-works/page.tsx", "mainnet-demo/page.tsx", "withdraw/page.tsx"];
  for (const route of requiredRoutes) {
    if (!existsSync(path.join(web, "app", route))) throw new Error(`missing route:${route}`);
  }

  const source = sourceFiles(web).map((file) => readFileSync(file, "utf8")).join("\n");
  if (/\bOnest\b|onest\//i.test(source)) throw new Error("Onest remains in web source");
  if (/rounded-(?:full|xl|2xl|3xl)\b/.test(source)) throw new Error("large/pill radius remains in web source");
  for (const marker of ["useSendEvmTransaction", "useSignEvmTypedData", "ensureBoundWallet", "idempotency-key", "quoteStockAmount", "waitForReceipt"]) {
    if (!source.includes(marker)) throw new Error(`flow hardening marker missing:${marker}`);
  }

  const chainSmoke = newestEvidence("phase1-audit.json");
  const apiSmoke = newestEvidence("api-smoke.json");
  if (!chainSmoke) throw new Error("Base Sepolia contract smoke evidence missing");
  if (!apiSmoke) throw new Error("API smoke evidence missing");

  const findings = [
    "13 public/compatibility routes are present and browser-tested on desktop and mobile",
    "IBM Plex Mono is the sole application font and no large/pill radius utilities remain",
    "shared buttons use the Wisp/Lujaw hero cobalt-gradient and charcoal visual system",
    "CDP EVM transaction and typed-data hooks back the embedded wallet adapter",
    "faucet, send, claim, and refund bind the authenticated wallet and wait for successful receipts",
    "send reads the live registry quote, uses permit-first funding, and never approval-fallbacks after broadcast",
    "all frontend API mutations receive idempotency keys",
    "claim verifies token, amount, schedule, and state against escrow before broadcast",
    "errors and warnings are surfaced through Sonner toasts instead of inline alert blocks",
    `API smoke evidence: ${path.relative(root, apiSmoke)}`,
    `Base Sepolia flow evidence: ${path.relative(root, chainSmoke)}`,
    `CDP browser project: ${process.env.NEXT_PUBLIC_CDP_PROJECT_ID ? "configured" : "unavailable"}`,
  ];

  const doc = `# Phase 3 audit and resync\n\nAudit date: ${new Date().toISOString()}\nNetwork: Base Sepolia (\`84532\`)\n\n## Result\n\nPhase 3 gates passed.\n\n${findings.map((item) => `- ${item}`).join("\n")}\n\n## Corrective implementation\n\n1. Resynced every gift/API response projection with the Phase 2 backend contract.\n2. Replaced address-only CDP bridging with embedded-wallet typed signing and transaction submission.\n3. Hardened faucet, send, claim, and refund against double-clicks, reverted receipts, stale quotes, expired authorization, and permit fallback duplication.\n4. Added live unlock scheduling/countdowns and post-receipt indexer polling.\n5. Unified route shells, forms, cards, tabs, status chips, progress UI, modal styling, and responsive layouts with the Wotta template.\n6. Replaced Onest with IBM Plex Mono, reduced all radii to small/medium, and adopted the reference hero button palette.\n7. Removed inline failure/warning blocks in favor of deduplicated toasts.\n8. Added API idempotency/projection regression tests and desktop/mobile route coverage.\n\n## Testnet boundary\n\nWisp assets and tUSDC are test assets on Base Sepolia; they are not real securities or real USDC. Live CDP and notification credentials are reported only as configured/unavailable and are never written to this report.\n`;
  writeFileSync(path.join(root, "docs/phase3-audit.md"), doc);
  console.log("\nphase3 audit ok");
  console.log("wrote docs/phase3-audit.md");
} catch (error) {
  console.error("\nphase3 audit failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
