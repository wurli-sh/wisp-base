import { SignJWT, jwtVerify } from "jose";
import {
  recipientDescriptorSchema,
  recipientKindSchema,
  type RecipientDescriptor,
} from "@wisp/shared";
import { getAddress } from "viem";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { normalizeIdentifier } from "../auth/normalize.js";
import { activeWalletBindingForProfile, findActiveWalletBindingByAddress } from "../auth/wallet-bindings.js";
import { lookupHashForAddress, lookupHashForEmail, lookupHashForX } from "../delivery/pending.js";
import type { BasenameResolver } from "./basenames.js";

type RecipientKind = z.infer<typeof recipientKindSchema>;

const DESCRIPTOR_TTL_SECONDS = 300;
const signingKey = (config: Config) => new TextEncoder().encode(config.env.DESCRIPTOR_SIGNING_KEY);

const signedPayloadSchema = recipientDescriptorSchema.extend({
  lookupHash: z.string().regex(/^[a-f0-9]{64}$/),
});

function ownershipProviders(kind: "email" | "x"): ("email" | "google" | "x")[] {
  return kind === "x" ? ["x"] : ["email", "google"];
}

export async function lookupIdentityByKind(
  db: Db,
  kind: "email" | "x",
  normalized: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("identities")
    .select("profile_id")
    .in("provider", ownershipProviders(kind))
    .eq("normalized_identifier", normalized)
    .is("revoked_at", null)
    .not("verified_at", "is", null);
  if (error) throw error;
  const profileIds = [...new Set((data ?? []).map((row) => row.profile_id))];
  if (profileIds.length > 1) throw new Error("identity_ambiguous");
  return profileIds[0] ?? null;
}

export async function buildAndSignDescriptor(
  db: Db,
  config: Config,
  basenames: BasenameResolver,
  kind: RecipientKind,
  identifier: string,
): Promise<{ descriptor: RecipientDescriptor; signature: string }> {
  let recipientProfileRef: string | null = null;
  let recipientAddress: `0x${string}` | null = null;
  let registered = false;
  let lookupHash: string;

  if (kind === "basename") {
    if (/^0x[a-fA-F0-9]{40}$/.test(identifier.trim())) {
      throw new Error("invalid_identifier");
    }
    const resolved = await basenames.resolve(identifier);
    recipientAddress = getAddress(resolved);
    lookupHash = lookupHashForAddress(config, recipientAddress);
    const binding = await findActiveWalletBindingByAddress(db, config.manifest.chainId, recipientAddress);
    if (binding) {
      recipientProfileRef = binding.profile_id;
      registered = true;
    }
  } else {
    const normalized = normalizeIdentifier(kind === "email" ? "email" : "x", identifier);
    lookupHash =
      kind === "email" ? lookupHashForEmail(config, normalized) : lookupHashForX(config, normalized);
    recipientProfileRef = await lookupIdentityByKind(db, kind, normalized);
    if (recipientProfileRef) {
      registered = true;
      const wallet = await activeWalletBindingForProfile(db, recipientProfileRef, config.manifest.chainId);
      if (wallet) recipientAddress = getAddress(wallet.address as `0x${string}`);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const descriptor: RecipientDescriptor = {
    version: 1,
    descriptorId: crypto.randomUUID(),
    kind,
    registered,
    recipientProfileRef,
    recipientAddress,
    issuedAt: now,
    validUntil: now + DESCRIPTOR_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  };

  const signature = await new SignJWT({ ...descriptor, lookupHash })
    .setProtectedHeader({ alg: "HS256", typ: "wisp+descriptor" })
    .setIssuedAt(now)
    .setExpirationTime(descriptor.validUntil)
    .sign(signingKey(config));

  return { descriptor, signature };
}

export async function verifyDescriptor(
  config: Config,
  descriptor: RecipientDescriptor,
  signature: string,
): Promise<RecipientDescriptor & { lookupHash: string }> {
  const parsed = recipientDescriptorSchema.parse(descriptor);
  if (parsed.validUntil * 1000 <= Date.now()) throw new Error("descriptor_expired");
  try {
    const { payload } = await jwtVerify(signature, signingKey(config), {
      algorithms: ["HS256"],
      typ: "wisp+descriptor",
    });
    const claims = signedPayloadSchema.parse(payload);
    if (
      claims.descriptorId !== parsed.descriptorId ||
      claims.kind !== parsed.kind ||
      claims.nonce !== parsed.nonce ||
      claims.recipientProfileRef !== parsed.recipientProfileRef ||
      (claims.recipientAddress?.toLowerCase() ?? null) !==
        (parsed.recipientAddress?.toLowerCase() ?? null) ||
      claims.registered !== parsed.registered ||
      claims.issuedAt !== parsed.issuedAt ||
      claims.validUntil !== parsed.validUntil
    ) {
      throw new Error("descriptor_invalid");
    }
    return claims;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "descriptor_expired" || error.message === "descriptor_invalid")
    ) {
      throw error;
    }
    throw new Error("descriptor_invalid");
  }
}
