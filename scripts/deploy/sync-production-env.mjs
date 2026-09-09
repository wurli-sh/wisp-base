#!/usr/bin/env node
/**
 * Sync production origins + credentials between local .env, Vercel web, and Render API.
 *
 * Usage:
 *   pnpm deploy:env
 *   pnpm deploy:env -- --dry-run
 *   pnpm deploy:env -- --render-only
 *   pnpm deploy:env -- --vercel-only
 *   pnpm deploy:env -- --render-only --render-deploy
 *   pnpm deploy:env -- --web-origin https://wisp-base.vercel.app --api-origin https://wisp-base-api.onrender.com
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const envPath = path.join(root, ".env");
const local = parseEnv(readFileSync(envPath, "utf8"));
const env = { ...local, ...process.env };
const args = new Set(process.argv.slice(2));
const webOrigin = cleanOrigin(
  argumentValue("--web-origin") || env.PROD_WEB_ORIGIN || "https://wisp-base.vercel.app",
  "PROD_WEB_ORIGIN",
);
const apiOrigin = cleanOrigin(
  argumentValue("--api-origin") || env.PROD_API_ORIGIN || "https://wisp-base-api.onrender.com",
  "PROD_API_ORIGIN",
);
const scope = env.VERCEL_SCOPE || "wurli-shs-projects";
const project = env.VERCEL_PROJECT || "wisp-base";
const renderServiceName = env.RENDER_SERVICE_NAME || "wisp-base-api";
const githubRepo = env.RENDER_GITHUB_REPO || "https://github.com/wurli-sh/wisp-base";
const dryRun = args.has("--dry-run");
const renderDeploy = args.has("--render-deploy");

const api = required({
  NODE_ENV: "production",
  API_ORIGIN: apiOrigin,
  CORS_ORIGINS: webOrigin,
  NEXT_PUBLIC_APP_ORIGIN: webOrigin,
  NEXT_PUBLIC_CHAIN_ID: "84532",
  DEPLOYMENT_MANIFEST_PATH: "/app/deployments/base-sepolia.json",
  RUN_INDEXER: "true",
  LOG_LEVEL: env.LOG_LEVEL || "info",
  SUPABASE_URL: pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_SECRET_KEY: pick("SUPABASE_SECRET_KEY"),
  IDENTITY_LOOKUP_KEY: pick("IDENTITY_LOOKUP_KEY"),
  DESCRIPTOR_SIGNING_KEY: pick("DESCRIPTOR_SIGNING_KEY"),
  NEXT_PUBLIC_RPC_URL: pick("NEXT_PUBLIC_RPC_URL", "BASE_SEPOLIA_RPC_URL"),
  DEPLOYER_PRIVATE_KEY: pick("DEPLOYER_PRIVATE_KEY"),
});
if (pickOptional("BASE_SEPOLIA_RPC_URL")) api.BASE_SEPOLIA_RPC_URL = pickOptional("BASE_SEPOLIA_RPC_URL");
if (pickOptional("CLAIM_AUTHORIZER_PRIVATE_KEY")) {
  api.CLAIM_AUTHORIZER_PRIVATE_KEY = pickOptional("CLAIM_AUTHORIZER_PRIVATE_KEY");
}
if (pickOptional("RESEND_API_KEY")) api.RESEND_API_KEY = pickOptional("RESEND_API_KEY");
if (pickOptional("RESEND_FROM_EMAIL")) api.RESEND_FROM_EMAIL = pickOptional("RESEND_FROM_EMAIL");

const web = required({
  NEXT_PUBLIC_APP_ORIGIN: webOrigin,
  NEXT_PUBLIC_API_URL: apiOrigin,
  NEXT_PUBLIC_CHAIN_ID: "84532",
  NEXT_PUBLIC_RPC_URL: pick("NEXT_PUBLIC_RPC_URL", "BASE_SEPOLIA_RPC_URL"),
  NEXT_PUBLIC_SUPABASE_URL: pick("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pick(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ),
  NEXT_PUBLIC_CDP_PROJECT_ID: pick("NEXT_PUBLIC_CDP_PROJECT_ID"),
});

if (args.has("--render-only") && args.has("--vercel-only")) {
  throw new Error("--render-only and --vercel-only cannot be used together");
}

if (dryRun) {
  printPlan();
} else {
  if (!args.has("--vercel-only")) syncRender();
  if (!args.has("--render-only")) syncVercel();
}

console.log(`Production origins configured: web=${webOrigin} api=${apiOrigin}`);

function syncRender() {
  const result = run("render", ["services", "--output", "json"], { capture: true });
  const services = JSON.parse(result.stdout || "[]");
  const service = createRenderServiceIfMissing(services, renderServiceName, api);
  upsertRenderEnv(service, renderServiceName, api);
  if (renderDeploy) deployExistingRenderService(service, renderServiceName);
}

function createRenderServiceIfMissing(services, name, values) {
  const found = services.find((entry) => (entry.service?.name || entry.name) === name);
  if (found) {
    console.log(`Render: ${name} already exists`);
    return found.service ?? found;
  }
  const command = [
    "services",
    "create",
    "--confirm",
    "--output",
    "json",
    "--name",
    name,
    "--type",
    "web_service",
    "--repo",
    githubRepo,
    "--branch",
    "main",
    "--runtime",
    "docker",
    "--root-directory",
    ".",
    "--plan",
    "free",
    "--region",
    "singapore",
    "--health-check-path",
    "/v1/health",
  ];
  for (const [key, value] of Object.entries(values)) {
    command.push("--env-var", `${key}=${value}`);
  }
  const created = run("render", command, { capture: true });
  console.log(`Render: created ${name}`);
  try {
    return JSON.parse(created.stdout || "{}");
  } catch {
    return undefined;
  }
}

function upsertRenderEnv(service, name, values) {
  const id = service?.id ?? service?.service?.id;
  if (!id) {
    console.log(`Render: ${name} env was set at create time (no service id yet for upsert).`);
    return;
  }
  const token = readRenderApiKey();
  if (!token) {
    console.log(`Render: no API key in ~/.render/cli.yaml — skip env upsert for ${name}`);
    return;
  }
  const existing = renderApi("GET", `/services/${id}/env-vars`, token) || [];
  const map = new Map();
  for (const row of existing) {
    const key = row.envVar?.key || row.key;
    const value = row.envVar?.value || row.value;
    if (key) map.set(key, value ?? "");
  }
  for (const [key, value] of Object.entries(values)) map.set(key, value);
  const body = [...map.entries()].map(([key, value]) => ({ key, value }));
  renderApi("PUT", `/services/${id}/env-vars`, token, body);
  console.log(`Render: synced ${body.length} env vars on ${name}`);
}

function readRenderApiKey() {
  try {
    const text = readFileSync(path.join(process.env.HOME || "", ".render/cli.yaml"), "utf8");
    const match = text.match(/^\s*key:\s*(\S+)/m);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function renderApi(method, apiPath, token, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const result = spawnSync(
    "curl",
    [
      "-sS",
      "-X",
      method,
      `https://api.render.com/v1${apiPath}`,
      "-H",
      `Authorization: Bearer ${token}`,
      "-H",
      "Accept: application/json",
      ...(payload
        ? ["-H", "Content-Type: application/json", "-d", payload]
        : []),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Render API ${method} ${apiPath} failed`);
  }
  const raw = (result.stdout || "").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function deployExistingRenderService(service, name) {
  const id = service?.id ?? service?.service?.id;
  if (!id) {
    console.log(`Render: ${name} was just created; its initial deploy will use the configured branch.`);
    return;
  }
  const commit = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("cannot resolve current Git commit for Render deploy");
  run("render", ["deploys", "create", id, "--commit", commit, "--wait", "--confirm"]);
  console.log(`Render: deployed ${name} at ${commit}`);
}

function syncVercel() {
  run("vercel", ["link", "--yes", "--scope", scope, "--project", project]);
  for (const [key, value] of Object.entries(web)) {
    const commandArgs = ["env", "add", key, "production", "--force", "--yes", "--value", value];
    if (key.startsWith("NEXT_PUBLIC_")) commandArgs.push("--no-sensitive");
    run("vercel", commandArgs);
    // Keep Preview/Development in sync for FE public vars
    for (const target of ["preview", "development"]) {
      const targetArgs = ["env", "add", key, target, "--force", "--yes", "--value", value];
      if (key.startsWith("NEXT_PUBLIC_")) targetArgs.push("--no-sensitive");
      run("vercel", targetArgs, { allowFail: true });
    }
  }
  console.log(`Vercel: synced ${Object.keys(web).length} variables to ${scope}/${project}`);
}

function printPlan() {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        webOrigin,
        apiOrigin,
        render: { service: renderServiceName, envKeys: Object.keys(api).sort(), deployCurrentCommit: renderDeploy },
        vercel: { project: `${scope}/${project}`, envKeys: Object.keys(web).sort() },
      },
      null,
      2,
    ),
  );
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    input: options.input,
    stdio: options.capture
      ? ["ignore", "pipe", "pipe"]
      : options.input
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
  });
  if (result.status !== 0 && !options.allowFail) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed (${result.status})${err ? `: ${err.slice(0, 400)}` : ""}`);
  }
  return result;
}

function required(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`${key} is required for production deployment`);
  }
  return values;
}

function pick(...names) {
  const value = pickOptional(...names);
  if (!value) throw new Error(`${names.join(" or ")} is missing from .env`);
  return value;
}

function pickOptional(...names) {
  for (const name of names) if (env[name]?.trim()) return env[name].trim();
  return "";
}

function cleanOrigin(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must be a public HTTPS origin`);
  }
  return url.origin;
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseEnv(source) {
  const output = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}
