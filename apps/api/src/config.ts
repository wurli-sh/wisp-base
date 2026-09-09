import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseDeploymentManifest, type DeploymentManifest } from "@wisp/shared";
import { type Hex, getAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const envBoolean = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((value) => value === true || value === "true"),
);

const privateKeySchema = z
  .string()
  .min(1)
  .transform((value): Hex => {
    const normalized = value.startsWith("0x") ? value : `0x${value}`;
    if (!isHex(normalized) || normalized.length !== 66) {
      throw new Error("invalid_claim_authorizer_key");
    }
    return normalized as Hex;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535),
  API_ORIGIN: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  LOG_LEVEL: z.string().default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  IDENTITY_LOOKUP_KEY: z.string().min(32),
  DESCRIPTOR_SIGNING_KEY: z.string().min(32),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().refine((id) => id === 84532, "expected 84532"),
  NEXT_PUBLIC_APP_ORIGIN: z.string().url(),
  DEPLOYMENT_MANIFEST_PATH: z.string().min(1),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_RPC_URL: z.string().url().optional(),
  CLAIM_AUTHORIZER_PRIVATE_KEY: z.string().optional(),
  DEPLOYER_PRIVATE_KEY: z.string().optional(),
  RUN_INDEXER: envBoolean.default(false),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  rpcUrl: string;
  claimAuthorizerPrivateKey: Hex;
};

export type Config = {
  env: Env;
  port: number;
  origin: string;
  corsOrigins: string[];
  appOrigin: string;
  manifest: DeploymentManifest;
  manifestPath: string;
  claimAuthorizerAddress: `0x${string}`;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(source);
  const rpcUrl = parsed.BASE_SEPOLIA_RPC_URL || parsed.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) throw new Error("invalid_body");

  const claimKeyRaw = parsed.CLAIM_AUTHORIZER_PRIVATE_KEY?.trim() || parsed.DEPLOYER_PRIVATE_KEY?.trim();
  if (!claimKeyRaw) throw new Error("invalid_claim_authorizer_key");
  const claimAuthorizerPrivateKey = privateKeySchema.parse(claimKeyRaw);
  const claimAccount = privateKeyToAccount(claimAuthorizerPrivateKey);

  const manifestPath = path.isAbsolute(parsed.DEPLOYMENT_MANIFEST_PATH)
    ? parsed.DEPLOYMENT_MANIFEST_PATH
    : path.resolve(repoRoot, parsed.DEPLOYMENT_MANIFEST_PATH);
  const manifest = parseDeploymentManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (manifest.chainId !== parsed.NEXT_PUBLIC_CHAIN_ID) throw new Error("wrong_network");
  if (getAddress(claimAccount.address) !== getAddress(manifest.claimSigner)) {
    throw new Error("claim_authorization_invalid");
  }

  const env: Env = {
    ...parsed,
    rpcUrl,
    claimAuthorizerPrivateKey,
  };

  return {
    env,
    port: env.PORT,
    origin: env.API_ORIGIN.replace(/\/$/, ""),
    corsOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    appOrigin: env.NEXT_PUBLIC_APP_ORIGIN.replace(/\/$/, ""),
    manifest,
    manifestPath,
    claimAuthorizerAddress: getAddress(claimAccount.address),
  };
}
