#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const suites = [
  { name: "shared:test", cmd: "npm", args: ["run", "test", "--workspace", "@wisp/shared"] },
  { name: "shared:typecheck", cmd: "npm", args: ["run", "typecheck", "--workspace", "@wisp/shared"] },
  { name: "contracts:fmt:check", cmd: "npm", args: ["run", "contracts:fmt:check"] },
  { name: "contracts:build", cmd: "npm", args: ["run", "contracts:build"] },
  { name: "contracts:test", cmd: "npm", args: ["run", "contracts:test"] },
  { name: "contracts:test:invariant", cmd: "npm", args: ["run", "contracts:test:invariant"] },
];

const results = [];

for (const suite of suites) {
  process.stdout.write(`\n==> ${suite.name}\n`);
  const result = spawnSync(suite.cmd, suite.args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const ok = result.status === 0;
  results.push({ name: suite.name, ok, status: result.status ?? 1 });
  if (!ok) {
    console.error(`Suite failed: ${suite.name} (exit ${result.status})`);
  }
}

console.log("\n=== check summary ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
}

const failed = results.filter((r) => !r.ok);
process.exit(failed.length === 0 ? 0 : 1);
