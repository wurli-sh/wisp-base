#!/usr/bin/env node
/**
 * Root `pnpm dev` — starts FE + API (indexer runs inside API when RUN_INDEXER=true).
 *
 *   web  → http://localhost:3000
 *   api  → http://127.0.0.1:8787
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (existsSync(path.join(root, ".env"))) {
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {
    // Node < 20.12 may lack loadEnvFile; children still load .env themselves.
  }
}

/** @typedef {{ name: string, args: string[] }} Service */

/** @type {Service[]} */
const services = [
  { name: "web", args: ["--filter", "@wisp/web", "dev"] },
  { name: "api", args: ["--filter", "@wisp/api", "dev"] },
];

assertPortFree(3000, "web");
assertPortFree(8787, "api");

process.stdout.write(
  "[dev] web http://localhost:3000 · api http://127.0.0.1:8787\n",
);

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map();
let stopping = false;

for (const service of services) {
  const childEnv = { ...process.env };
  // Root .env often sets PORT=8787 for the API; Next would inherit it and steal the API port.
  if (service.name === "web") {
    childEnv.PORT = "3000";
  }
  const child = spawn("pnpm", service.args, {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  children.set(service.name, child);
  child.once("error", (error) => {
    process.stderr.write(`[dev:${service.name}] ${error.message}\n`);
    void stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `exit ${code ?? 1}`;
    process.stderr.write(
      `[dev:${service.name}] stopped (${reason}); shutting down the stack\n`,
    );
    void stop(code ?? 1);
  });
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));

/**
 * @param {number} code
 */
async function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const [name, child] of children) {
    try {
      if (child.pid && process.platform !== "win32") {
        process.kill(-child.pid, "SIGTERM");
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      process.stderr.write(`[dev] failed to signal ${name}\n`);
    }
  }
  // Give children a moment, then force-exit.
  await new Promise((r) => setTimeout(r, 400));
  process.exit(code);
}

/**
 * @param {number} port
 * @param {string} label
 */
function assertPortFree(port, label) {
  const pids = portListenPids(port);
  if (pids.length === 0) return;
  process.stderr.write(
    `[dev] error: port ${port} (${label}) is already in use (pids ${pids.join(", ")})\n` +
      `[dev] stop the old stack (Ctrl+C), or: fuser -k ${port}/tcp\n`,
  );
  process.exit(1);
}

/**
 * @param {number} port
 * @returns {string[]}
 */
function portListenPids(port) {
  try {
    const out = execSync(`ss -ltnp 'sport = :${port}' 2>/dev/null || true`, {
      encoding: "utf8",
    });
    const pids = new Set();
    for (const match of out.matchAll(/pid=(\d+)/g)) {
      pids.add(match[1]);
    }
    return [...pids];
  } catch {
    return [];
  }
}
