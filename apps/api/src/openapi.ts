import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const routes = [
  { method: "get", path: "/v1/health", summary: "Health, DB, RPC, indexer lag" },
  { method: "get", path: "/v1/config", summary: "Public deployment configuration" },
  { method: "get", path: "/v1/openapi.json", summary: "OpenAPI document" },
  { method: "post", path: "/v1/session/sync", summary: "Sync profile identities and pending deliveries" },
  { method: "get", path: "/v1/me", summary: "Current profile, identities, wallet" },
  { method: "post", path: "/v1/wallet/challenge", summary: "Issue wallet link EIP-712 challenge" },
  { method: "post", path: "/v1/wallet/link", summary: "Verify and bind wallet" },
  { method: "post", path: "/v1/wallet/unlink", summary: "Soft-unlink wallet" },
  { method: "post", path: "/v1/resolve", summary: "Signed recipient descriptor" },
  { method: "post", path: "/v1/gifts", summary: "Create gift draft" },
  { method: "post", path: "/v1/gifts/{id}/submitted", summary: "Attach funding tx hash" },
  { method: "get", path: "/v1/gifts", summary: "List sender gifts" },
  { method: "get", path: "/v1/gifts/{id}", summary: "Gift projection" },
  { method: "post", path: "/v1/gifts/{id}/claim-authorization", summary: "Recipient claim EIP-712 auth" },
  { method: "post", path: "/v1/gifts/{id}/read", summary: "Mark inbox item read" },
  { method: "get", path: "/v1/inbox", summary: "Wisp Inbox" },
  { method: "get", path: "/v1/activity", summary: "Incoming and sent activity" },
] as const;

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const openPath = route.path.replace(/\{id\}/g, "{id}");
    paths[openPath] ??= {};
    paths[openPath][route.method] = {
      summary: route.summary,
      responses: {
        "200": { description: "OK" },
        "400": { description: "Client error" },
        "401": { description: "Unauthorized" },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Wisp API",
      version: "0.0.1",
      description: "Phase 2 Fastify API for Wisp on Base Sepolia",
    },
    servers: [{ url: "http://127.0.0.1:8787" }],
    paths,
  };
}

export function writeOpenApi(outPath?: string) {
  const target =
    outPath ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../openapi.json");
  const doc = buildOpenApi();
  writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`);
  return { target, hash: createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 16) };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const { target, hash } = writeOpenApi();
  console.log(`wrote ${target} (${hash})`);
}
