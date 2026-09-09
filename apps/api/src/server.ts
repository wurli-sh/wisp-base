import cors from "@fastify/cors";
import Fastify, { type FastifyReply } from "fastify";
import { z } from "zod";
import {
  createGiftRequestSchema,
  idempotencyKeySchema,
  resolveRequestSchema,
  submittedGiftRequestSchema,
  walletChallengeRequestSchema,
  walletLinkRequestSchema,
} from "@wisp/shared";
import { loadConfig, type Config } from "./config.js";
import { createDb, type Db } from "./db/client.js";
import { createLogger, safeError } from "./logger.js";
import { createChainClient } from "./chain/client.js";
import { startIndexer } from "./chain/indexer.js";
import { requireAuth } from "./auth/require-auth.js";
import { syncProfileIdentities } from "./auth/sync.js";
import {
  activeWalletBindingForProfile,
  createWalletChallenge,
  linkWallet,
  unlinkWallet,
} from "./auth/wallet-bindings.js";
import { buildAndSignDescriptor } from "./resolver/descriptors.js";
import { ViemBasenameResolver } from "./resolver/basenames.js";
import { claimPendingDeliveriesForProfile } from "./delivery/pending.js";
import {
  createDraft,
  getGiftProjection,
  listActivity,
  listInbox,
  listSenderGifts,
  markRead,
  markSubmitted,
} from "./gifts/service.js";
import { withIdempotency } from "./gifts/idempotency.js";
import { authorizeClaim } from "./claims/authorize.js";
import { buildOpenApi } from "./openapi.js";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type Deps = {
  config: Config;
  db: Db;
  log: ReturnType<typeof createLogger>;
  client: ReturnType<typeof createChainClient>;
  basenames: ViemBasenameResolver;
};

function deps(config = loadConfig()): Deps {
  const client = createChainClient(config);
  return {
    config,
    db: createDb(config),
    log: createLogger(config),
    client,
    basenames: new ViemBasenameResolver(client),
  };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error("invalid_body");
  return result.data;
}

function idempotencyKey(request: { headers: Record<string, string | string[] | undefined> }): string {
  const value = request.headers["idempotency-key"];
  try {
    return idempotencyKeySchema.parse(value);
  } catch {
    throw new Error("invalid_body");
  }
}

/** Fastify and PostgREST both require JSON-safe values; viem typed data contains bigint fields. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested,
    ),
  ) as T;
}

function errorStatus(code: string): number {
  if (code === "unauthorized") return 401;
  if (code === "not_found" || code === "gift_not_found") return 404;
  if (
    code === "identity_already_linked" ||
    code === "wallet_already_linked" ||
    code === "version_conflict" ||
    code === "idempotency_key_reuse" ||
    code === "quote_changed"
  ) {
    return 409;
  }
  if (code === "notification_unavailable" || code === "indexer_delayed") return 503;
  return 400;
}

function errorReply(reply: FastifyReply, error: unknown) {
  const message = safeError(error);
  const code = message.split(":")[0] ?? "invalid_body";
  return reply.code(errorStatus(code)).send({ error: { code, message } });
}

export async function buildServer(d = deps()) {
  const app = Fastify({ bodyLimit: 256 * 1024, loggerInstance: d.log });
  await app.register(cors, { origin: d.config.corsOrigins, credentials: false });

  app.addHook("onRequest", async (request, reply) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      request.url.startsWith("/v1/") &&
      request.headers.cookie
    ) {
      return reply.code(400).send({ error: { code: "cookie_auth_forbidden", message: "cookie_auth_forbidden" } });
    }
  });

  app.addHook("onSend", async (_request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer");
  });

  app.get("/v1/health", async () => {
    let database: "ok" | "error" = "ok";
    try {
      const { error } = await d.db.from("profiles").select("id").limit(1);
      if (error) database = "error";
    } catch {
      database = "error";
    }

    let rpc: "ok" | "error" = "ok";
    let chainId: number | null = null;
    try {
      chainId = await d.client.getChainId();
      if (chainId !== d.config.manifest.chainId) rpc = "error";
    } catch {
      rpc = "error";
    }

    let indexerLagBlocks: number | null = null;
    try {
      const { data: cursor } = await d.db
        .from("indexer_cursors")
        .select("block_number")
        .eq("chain_id", d.config.manifest.chainId)
        .maybeSingle();
      if (cursor && rpc === "ok") {
        const latest = await d.client.getBlockNumber();
        indexerLagBlocks = Number(latest - BigInt(cursor.block_number));
      }
    } catch {
      indexerLagBlocks = null;
    }

    const manifestRaw = readFileSync(d.config.manifestPath, "utf8");
    const manifestHash = createHash("sha256").update(manifestRaw).digest("hex").slice(0, 16);

    return {
      ok: database === "ok" && rpc === "ok",
      database,
      rpc,
      chainId,
      indexerLagBlocks,
      manifestHash,
      notifications: d.config.env.RESEND_API_KEY ? "configured" : "unavailable",
      cdpWallet:
        process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET ? "configured" : "unavailable",
    };
  });

  app.get("/v1/config", async () => ({
    chainId: d.config.manifest.chainId,
    network: d.config.manifest.network,
    deploymentBlock: d.config.manifest.deploymentBlock,
    contracts: d.config.manifest.contracts,
    assets: d.config.manifest.assets,
    faucet: d.config.manifest.faucet,
    claimSigner: d.config.manifest.claimSigner,
  }));

  app.get("/v1/openapi.json", async () => buildOpenApi());

  app.post("/v1/session/sync", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const key = idempotencyKey(request);
      return await withIdempotency(d.db, auth.userId, key, { route: "session/sync" }, async () => {
        const session = await syncProfileIdentities(d.db, auth.token);
        const pendingDelivered = await claimPendingDeliveriesForProfile(
          d.db,
          d.config,
          session.profileId,
          session.synced,
        );
        return { ...session, pendingDelivered };
      });
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get("/v1/me", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const [profile, identities, wallet] = await Promise.all([
        d.db.from("profiles").select("*").eq("id", auth.userId).maybeSingle(),
        d.db
          .from("identities")
          .select("provider,normalized_identifier,verified_at")
          .eq("profile_id", auth.userId)
          .is("revoked_at", null),
        activeWalletBindingForProfile(d.db, auth.userId, d.config.manifest.chainId),
      ]);
      return {
        profile: profile.data,
        identities: identities.data ?? [],
        wallet: wallet
          ? { address: wallet.address, chainId: wallet.chain_id, verifiedAt: wallet.verified_at }
          : null,
      };
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/wallet/challenge", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const body = parseBody(walletChallengeRequestSchema, request.body);
      const key = idempotencyKey(request);
      return await withIdempotency(d.db, auth.userId, key, { route: "wallet/challenge", ...body }, async () =>
        jsonSafe(
          await createWalletChallenge(
            d.db,
            d.config,
            auth.userId,
            body.address,
            request.headers.origin,
          ),
        ),
      );
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/wallet/link", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const body = parseBody(walletLinkRequestSchema, request.body);
      const key = idempotencyKey(request);
      return await withIdempotency(d.db, auth.userId, key, { route: "wallet/link", ...body }, async () => {
        const linked = await linkWallet(
          d.db,
          d.config,
          d.client,
          auth.userId,
          body,
          request.headers.origin,
        );
        // A Basename pending delivery can only become routable after this binding exists.
        const session = await syncProfileIdentities(d.db, auth.token);
        const pendingDelivered = await claimPendingDeliveriesForProfile(
          d.db,
          d.config,
          session.profileId,
          session.synced,
        );
        return { ...linked, pendingDelivered };
      });
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/wallet/unlink", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const key = idempotencyKey(request);
      return await withIdempotency(d.db, auth.userId, key, { route: "wallet/unlink" }, () =>
        unlinkWallet(d.db, auth.userId, d.config.manifest.chainId),
      );
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/resolve", async (request, reply) => {
    try {
      const body = parseBody(resolveRequestSchema, request.body);
      const auth = await requireAuth(d.db, request);
      const key = idempotencyKey(request);
      return await withIdempotency(d.db, auth.userId, key, { route: "resolve", ...body }, () =>
        buildAndSignDescriptor(d.db, d.config, d.basenames, body.kind, body.identifier),
      );
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/gifts", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const key = idempotencyKey(request);
      const body = parseBody(createGiftRequestSchema, request.body);
      const output = await withIdempotency(d.db, auth.userId, key, body, () =>
        createDraft(d.db, d.config, d.client, auth.userId, body),
      );
      return reply.code(201).send(output);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/gifts/:id/submitted", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const key = idempotencyKey(request);
      const body = parseBody(submittedGiftRequestSchema, request.body);
      const giftId = z.string().uuid().parse((request.params as { id: string }).id);
      const output = await withIdempotency(d.db, auth.userId, key, { giftId, ...body }, () =>
        markSubmitted(d.db, auth.userId, giftId, body.txHash),
      );
      return output;
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get("/v1/gifts", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      return { gifts: await listSenderGifts(d.db, auth.userId) };
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get("/v1/gifts/:id", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const giftId = z.string().uuid().parse((request.params as { id: string }).id);
      return await getGiftProjection(d.db, auth.userId, giftId);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/gifts/:id/claim-authorization", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const giftId = z.string().uuid().parse((request.params as { id: string }).id);
      const key = idempotencyKey(request);
      return await withIdempotency(
        d.db,
        auth.userId,
        key,
        { route: "claim-authorization", giftId },
        () => authorizeClaim(d.db, d.config, d.client, auth.userId, giftId),
      );
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.post("/v1/gifts/:id/read", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      const giftId = z.string().uuid().parse((request.params as { id: string }).id);
      const key = idempotencyKey(request);
      return await withIdempotency(
        d.db,
        auth.userId,
        key,
        { route: "gifts/read", giftId },
        () => markRead(d.db, auth.userId, giftId),
      );
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get("/v1/inbox", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      return await listInbox(d.db, auth.userId);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get("/v1/activity", async (request, reply) => {
    try {
      const auth = await requireAuth(d.db, request);
      return await listActivity(d.db, auth.userId);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  return app;
}

export async function start() {
  const d = deps();
  const app = await buildServer(d);
  let indexerStop: (() => void) | undefined;
  if (d.config.env.RUN_INDEXER) {
    const handle = startIndexer(d.config, d.db);
    indexerStop = handle.stop;
  }
  await app.listen({ port: d.config.port, host: "0.0.0.0" });
  return { app, stopIndexer: indexerStop };
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isMain) {
  start().catch((error) => {
    console.error(safeError(error));
    process.exit(1);
  });
}
