import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import ws from "ws";
import { loadConfig } from "../src/config.js";
import { createDb, type Db } from "../src/db/client.js";
import { createChainClient } from "../src/chain/client.js";
import { syncProfileIdentities } from "../src/auth/sync.js";
import { createWalletChallenge, linkWallet } from "../src/auth/wallet-bindings.js";
import { buildAndSignDescriptor } from "../src/resolver/descriptors.js";
import { ViemBasenameResolver } from "../src/resolver/basenames.js";
import { createDraft, markSubmitted, simulateFundedProjection } from "../src/gifts/service.js";
import { authorizeClaim } from "../src/claims/authorize.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
      .replace(/0x[a-fA-F0-9]{64}/g, "[REDACTED_HEX64]")
      .replace(/[a-f0-9]{64}/g, (match) => (match.length === 64 ? "[REDACTED_HASH]" : match));
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/key|secret|password|token|signature|private/i.test(key) && key !== "tokenAddress") {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redact(nested);
      }
    }
    return out;
  }
  return value;
}

function createAnonAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as never },
  });
}

async function ensureUser(
  serviceDb: Db,
  anonDb: ReturnType<typeof createAnonAuthClient>,
  email: string,
): Promise<{ id: string; accessToken: string }> {
  const password = `Smoke-${email}-9x!`;
  const existing = await serviceDb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = existing.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  let userId = found?.id;
  if (!userId) {
    const created = await serviceDb.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("user_create_failed");
    userId = created.data.user.id;
  } else {
    await serviceDb.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }

  // Never sign in on the service-role client — that would attach a user JWT and trip RLS.
  const signed = await anonDb.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    throw signed.error ?? new Error("sign_in_failed");
  }
  return { id: userId, accessToken: signed.data.session.access_token };
}

async function main() {
  const config = loadConfig();
  const db = createDb(config);
  const anonKey =
    config.env.SUPABASE_ANON_KEY ||
    config.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY missing for smoke sign-in");
  const anonDb = createAnonAuthClient(config.env.SUPABASE_URL, anonKey);
  const client = createChainClient(config);
  const basenames = new ViemBasenameResolver(client);

  const alice = await ensureUser(db, anonDb, "alice@example.test");
  const bob = await ensureUser(db, anonDb, "bob@example.test");

  const aliceSync = await syncProfileIdentities(db, alice.accessToken);
  const bobSync = await syncProfileIdentities(db, bob.accessToken);

  const aliceKey = generatePrivateKey();
  const bobKey = generatePrivateKey();
  const aliceWallet = privateKeyToAccount(aliceKey);
  const bobWallet = privateKeyToAccount(bobKey);

  const aliceChallenge = await createWalletChallenge(
    db,
    config,
    alice.id,
    aliceWallet.address,
    config.appOrigin,
  );
  const aliceSig = await aliceWallet.signTypedData(aliceChallenge.typedData);
  await linkWallet(
    db,
    config,
    client,
    alice.id,
    { challengeId: aliceChallenge.challengeId, address: aliceWallet.address, signature: aliceSig },
    config.appOrigin,
  );

  const bobChallenge = await createWalletChallenge(
    db,
    config,
    bob.id,
    bobWallet.address,
    config.appOrigin,
  );
  const bobSig = await bobWallet.signTypedData(bobChallenge.typedData);
  await linkWallet(
    db,
    config,
    client,
    bob.id,
    { challengeId: bobChallenge.challengeId, address: bobWallet.address, signature: bobSig },
    config.appOrigin,
  );

  const resolved = await buildAndSignDescriptor(db, config, basenames, "email", "bob@example.test");
  const asset = config.manifest.assets[0]!;
  const unlockAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

  // Quote from registry when RPC available; fall back to price math for smoke resilience.
  let quotedStockAmount: string;
  try {
    const { registryAbi } = await import("../src/chain/contracts.js");
    const quoted = await client.readContract({
      address: getAddress(config.manifest.contracts.assetRegistry),
      abi: registryAbi,
      functionName: "quoteStockAmount",
      args: [getAddress(asset.address), 10_000_000n],
    });
    quotedStockAmount = quoted.toString();
  } catch {
    quotedStockAmount = ((10_000_000n * 10n ** 18n) / BigInt(asset.usdPriceE6)).toString();
  }

  const draft = await createDraft(db, config, client, alice.id, {
    descriptor: resolved.descriptor,
    signature: resolved.signature,
    tokenAddress: asset.address,
    usdcAmount: "10000000",
    quotedStockAmount,
    unlockAt,
    expiresAt,
    anonymousSender: false,
    message: "smoke",
  });

  await markSubmitted(db, alice.id, draft.gift.id, `0x${"11".repeat(32)}`);
  // Unique unused onchain id so getGift returns empty (dev projection path) and re-runs don't collide.
  const simulatedOnchainId = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  await simulateFundedProjection(db, draft.gift.id, simulatedOnchainId);

  let bobAuthOk = false;
  let aliceAuthFailed = false;
  let claimAuth: unknown = null;
  try {
    claimAuth = await authorizeClaim(db, config, client, bob.id, draft.gift.id);
    bobAuthOk = true;
  } catch (error) {
    claimAuth = { error: error instanceof Error ? error.message : "error" };
  }
  try {
    await authorizeClaim(db, config, client, alice.id, draft.gift.id);
  } catch {
    aliceAuthFailed = true;
  }

  const evidence = {
    ok: bobAuthOk && aliceAuthFailed,
    at: new Date().toISOString(),
    chainId: config.manifest.chainId,
    aliceProfileId: aliceSync.profileId,
    bobProfileId: bobSync.profileId,
    giftId: draft.gift.id,
    bobClaimAuthorization: bobAuthOk,
    aliceClaimRejected: aliceAuthFailed,
    claimAuth,
    notifications: config.env.RESEND_API_KEY ? "configured" : "unavailable",
    cdp: process.env.CDP_API_KEY_ID ? "configured" : "unavailable",
  };

  const hash = createHash("sha256")
    .update(JSON.stringify({ giftId: draft.gift.id, at: evidence.at }))
    .digest("hex")
    .slice(0, 16);
  const outDir = path.join(root, "evidence", "base-sepolia", hash);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "api-smoke.json");
  writeFileSync(outPath, `${JSON.stringify(redact(evidence), null, 2)}\n`);

  console.log(`api smoke ${evidence.ok ? "ok" : "failed"}: ${outPath}`);
  if (!evidence.ok) process.exit(1);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error("smoke_failed", JSON.stringify(error, null, 2));
  }
  process.exit(1);
});
