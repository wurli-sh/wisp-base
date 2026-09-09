import { pino } from "pino";
import type { Config } from "./config.js";

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "authorization",
  "cookie",
  "email",
  "signature",
  "privateKey",
  "CLAIM_AUTHORIZER_PRIVATE_KEY",
  "DEPLOYER_PRIVATE_KEY",
  "DESCRIPTOR_SIGNING_KEY",
  "IDENTITY_LOOKUP_KEY",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "*.privateKey",
  "*.signature",
  "*.email",
];

export function createLogger(config: Config) {
  return pino({
    level: config.env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  });
}

export function safeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "unknown_error";
  return raw
    .replace(/(0x)?[\da-f]{64,}/gi, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 512);
}
