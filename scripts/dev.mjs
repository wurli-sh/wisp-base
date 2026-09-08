#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  "npm",
  ["run", "dev", "--workspace", "@wisp/web"],
  { cwd: root, stdio: "inherit", shell: true },
);

child.on("exit", (code) => process.exit(code ?? 1));
