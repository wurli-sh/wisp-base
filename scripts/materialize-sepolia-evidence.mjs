#!/usr/bin/env node
/**
 * Materialize Sepolia evidence.
 * Phase 0: refuse until a valid manifest exists.
 * Phase 1: contracts mode runs faucet → buyAndGift → claim → refund.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(resolve(root, ".env"));

const mode = process.argv[2] || "contracts";
const manifestPath =
  process.env.DEPLOYMENT_MANIFEST_PATH ||
  resolve(root, "deployments/base-sepolia.json");

async function main() {
  if (!existsSync(manifestPath)) {
    fail(`manifest missing at ${manifestPath}; run npm run deploy:sepolia first`);
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { parseDeploymentManifest } = await import("@wisp/shared");
  const manifest = parseDeploymentManifest(raw);

  if (mode === "contracts") {
    const bodyPath = resolve(root, "scripts/lib/smoke-contracts.mjs");
    if (!existsSync(bodyPath)) {
      fail("smoke contracts body not implemented yet (Phase 1)");
    }
    const { runContractsSmoke } = await import(bodyPath);
    await runContractsSmoke({ root, manifest });
    return;
  }

  fail(`unknown mode: ${mode}`);
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(message) {
  console.error(`smoke failed: ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
