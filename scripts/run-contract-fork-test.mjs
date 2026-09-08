#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
}

if (!env.NEXT_PUBLIC_RPC_URL && !env.BASE_SEPOLIA_RPC_URL) {
  console.error("contracts:test:fork requires NEXT_PUBLIC_RPC_URL or BASE_SEPOLIA_RPC_URL");
  process.exit(1);
}

const result = spawnSync(
  "base-forge",
  ["test", "--match-contract", "BaseSepoliaFork"],
  { cwd: resolve(root, "contracts"), env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
