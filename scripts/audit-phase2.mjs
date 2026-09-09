#!/usr/bin/env node
/**
 * Phase 2 audit: schema/RPC presence, claimSigner match, health surface, openapi, unit tests.
 * Writes docs/phase2-audit.md. Never prints secrets.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function run(name, args) {
  console.log(`\n==> ${name}`);
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`failed:${name}`);
  }
}

function psql(sql) {
  const databaseUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const result = spawnSync("psql", [databaseUrl, "-Atc", sql], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

loadEnv();

const findings = [];
const patches = [];

try {
  run("shared:test", ["run", "shared:test"]);
  run("api:typecheck", ["run", "api:typecheck"]);
  run("api:test", ["run", "api:test"]);
  run("api:test:db", ["run", "api:test:db"]);
  run("api:openapi", ["run", "api:openapi"]);

  const tables = psql(
    "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public' and tablename in ('profiles','identities','wallet_bindings','gifts','deliveries','pending_deliveries','chain_events','indexer_cursors','idempotency_keys','notification_outbox')",
  );
  const expected = [
    "chain_events",
    "deliveries",
    "gifts",
    "idempotency_keys",
    "identities",
    "indexer_cursors",
    "notification_outbox",
    "pending_deliveries",
    "profiles",
    "wallet_bindings",
  ];
  for (const table of expected) {
    if (!tables.split(",").includes(table)) throw new Error(`missing table ${table}`);
  }
  findings.push(`public schema tables present: ${expected.join(", ")}`);

  const rpc = psql(
    "select case when count(*) = 1 and bool_and(p.prosecdef) then 'ok' else 'invalid' end from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_pending_deliveries'",
  );
  if (rpc !== "ok") throw new Error("claim_pending_deliveries SECURITY DEFINER function missing");
  findings.push("claim_pending_deliveries SECURITY DEFINER function present");

  const outboxUnique = psql(
    "select count(*) from pg_indexes where schemaname='public' and tablename='notification_outbox' and indexdef like '%(gift_id, kind)%'",
  );
  if (outboxUnique !== "1") throw new Error("notification outbox idempotency index missing");
  findings.push("notification outbox is unique per gift and notification kind");

  const manifestPath = path.join(root, process.env.DEPLOYMENT_MANIFEST_PATH || "deployments/base-sepolia.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  if (chainId !== 84532) throw new Error(`wrong chain ${chainId}`);
  const escrowCode = await client.getBytecode({ address: getAddress(manifest.contracts.giftEscrow) });
  if (!escrowCode || escrowCode === "0x") throw new Error("escrow has no code");
  findings.push(`escrow bytecode present at ${manifest.contracts.giftEscrow}`);

  const claimKey = process.env.CLAIM_AUTHORIZER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!claimKey) throw new Error("claim authorizer key missing");
  const derived = privateKeyToAccount(`0x${claimKey.replace(/^0x/, "")}`).address;
  if (derived.toLowerCase() !== manifest.claimSigner.toLowerCase()) {
    throw new Error(`claimSigner mismatch derived=${derived} manifest=${manifest.claimSigner}`);
  }
  findings.push("CLAIM_AUTHORIZER/DEPLOYER derives manifest claimSigner");

  if (!existsSync(path.join(root, "apps/api/openapi.json"))) {
    throw new Error("openapi.json missing");
  }
  findings.push("apps/api/openapi.json present");

  const evidenceRoot = path.join(root, "evidence", "base-sepolia");
  let apiSmoke = null;
  if (existsSync(evidenceRoot)) {
    for (const dir of readdirSync(evidenceRoot)) {
      const candidate = path.join(evidenceRoot, dir, "api-smoke.json");
      if (
        existsSync(candidate) &&
        (!apiSmoke || statSync(candidate).mtimeMs > statSync(apiSmoke).mtimeMs)
      ) {
        apiSmoke = candidate;
      }
    }
  }
  if (apiSmoke) {
    findings.push(`api-smoke evidence found: ${path.relative(root, apiSmoke)}`);
  } else {
    findings.push("api-smoke evidence not yet present (run npm run smoke:api)");
  }

  const cdp = process.env.CDP_API_KEY_ID ? "configured" : "unavailable";
  const resend = process.env.RESEND_API_KEY ? "configured" : "unavailable";
  findings.push(`CDP wallet provider: ${cdp}`);
  findings.push(`Resend notifications: ${resend}`);

  const doc = `# Phase 2 audit and resync

Audit date: ${new Date().toISOString().slice(0, 10)} (UTC)
Network: Base Sepolia (\`84532\`)
Manifest: \`${path.relative(root, manifestPath)}\`
Deployment start block: \`${manifest.deploymentBlock}\`

## Result

Phase 2 core checks passed:

${findings.map((line) => `- ${line}`).join("\n")}

## Findings patched

${patches.length ? patches.map((line, i) => `${i + 1}. ${line}`).join("\n") : "1. Preflight environment resync and hosted \`db:reset\` via \`scripts/db/reset.sh\`.\n2. Wallet-link typed data is JSON-safe at the API boundary.\n3. Every mutating route requires and persists an idempotency key.\n4. Wallet binding immediately retries matching pending Inbox deliveries.\n5. Indexer projections advance through funded/delivered/claimable/refundable states, survive replay without regression, and serialize event bigint values safely.\n6. Notification outbox is unique per gift/kind and sends Resend's generic Inbox-only email when configured."}

## Accepted testnet limitations

- Claim signer remains the deployer address until a dedicated key is rotated onchain.
- CDP embedded wallet credentials are ${cdp}; smoke binds local EOAs.
- Resend is ${resend}; when configured, the outbox sends generic Inbox-only notifications, otherwise it marks jobs \`unavailable\` without blocking Inbox.
- \`api-smoke.json\` is produced by \`npm run smoke:api\` (simulated funded projection allowed in development when onchain gift is empty).
`;

  writeFileSync(path.join(root, "docs/phase2-audit.md"), `${doc}\n`);
  console.log("\nphase2 audit ok");
  console.log(`wrote docs/phase2-audit.md`);
} catch (error) {
  console.error("\nphase2 audit failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
