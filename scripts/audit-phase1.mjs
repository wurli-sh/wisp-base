#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { parseDeploymentManifest } from "@wisp/shared";
import { auditPhase1 } from "./lib/audit-phase1.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(resolve(root, ".env"));
const manifestPath = process.env.DEPLOYMENT_MANIFEST_PATH || resolve(root, "deployments/base-sepolia.json");
const manifest = parseDeploymentManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

const report = await auditPhase1({ client, manifest, verifyTransactions: true });
const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 16);
const outputPath = resolve(root, `evidence/base-sepolia/${manifestHash}/phase1-audit.json`);
atomicWriteJson(outputPath, { ...report, manifestHash, auditedAt: new Date().toISOString() });
console.log(`phase 1 audit ok: ${report.confirmedTransactions} deployment transactions, ${report.assets.length} assets`);
console.log(`evidence ${outputPath}`);

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function atomicWriteJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, path);
}
