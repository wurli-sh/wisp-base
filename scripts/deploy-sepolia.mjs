#!/usr/bin/env node
/**
 * Base Sepolia deploy orchestrator.
 * Phase 0: chain + B20 activation preflight only.
 * Phase 1: fills broadcast + manifest write.
 */
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(resolve(root, ".env"));

const ACTIVATION_REGISTRY = "0x8453000000000000000000000000000000000001";
const B20_ASSET_FEATURE = keccak256(stringToHex("base.b20_asset"));

const rpcUrl =
  process.env.BASE_SEPOLIA_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://sepolia.base.org";

const forceNew = process.argv.includes("--force-new");
const manifestPath =
  process.env.DEPLOYMENT_MANIFEST_PATH ||
  resolve(root, "deployments/base-sepolia.json");

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    fail("DEPLOYER_PRIVATE_KEY is required (do not use PRIVATE_KEY)");
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const chainId = await client.getChainId();
  if (chainId !== 84532) {
    fail(`expected chainId 84532, got ${chainId}`);
  }

  const activated = await client.readContract({
    address: ACTIVATION_REGISTRY,
    abi: [
      {
        type: "function",
        name: "isActivated",
        stateMutability: "view",
        inputs: [{ name: "feature", type: "bytes32" }],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "isActivated",
    args: [B20_ASSET_FEATURE],
  });

  if (!activated) {
    fail(
      `B20 asset feature is not activated on Base Sepolia (registry ${ACTIVATION_REGISTRY})`,
    );
  }

  console.log("preflight ok: chainId=84532, B20 asset activated");

  // Phase 1 body lives in scripts/lib/deploy-body.mjs once contracts exist.
  const bodyPath = resolve(root, "scripts/lib/deploy-body.mjs");
  if (!existsSync(bodyPath)) {
    console.log(
      "deploy body not implemented yet (Phase 1). Preflight succeeded.",
    );
    process.exit(0);
  }

  const { runDeploy } = await import(bodyPath);
  await runDeploy({
    root,
    client,
    rpcUrl,
    manifestPath,
    forceNew,
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
    claimAuthorizerPrivateKey:
      process.env.CLAIM_AUTHORIZER_PRIVATE_KEY ||
      process.env.DEPLOYER_PRIVATE_KEY,
  });
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
  console.error(`deploy:sepolia failed: ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
