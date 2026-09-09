import { createHash } from "node:crypto";
import type { Db } from "../db/client.js";

export function requestHash(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export async function getIdempotentResponse<T>(
  db: Db,
  ownerId: string,
  key: string,
  hash: string,
): Promise<T | null> {
  const { data, error } = await db
    .from("idempotency_keys")
    .select("request_hash,response")
    .eq("owner_id", ownerId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.request_hash !== hash) throw new Error("idempotency_key_reuse");
  return data.response as T;
}

export async function setIdempotentResponse(
  db: Db,
  ownerId: string,
  key: string,
  hash: string,
  response: unknown,
): Promise<void> {
  const { error } = await db.from("idempotency_keys").insert({
    owner_id: ownerId,
    key,
    request_hash: hash,
    response,
  });
  if (error) {
    if (error.code === "23505") throw new Error("idempotency_key_reuse");
    throw error;
  }
}

export async function withIdempotency<T>(
  db: Db,
  ownerId: string,
  key: string,
  request: unknown,
  action: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(request);
  const existing = await getIdempotentResponse<T>(db, ownerId, key, hash);
  if (existing) return existing;
  const response = await action();
  try {
    await setIdempotentResponse(db, ownerId, key, hash, response);
  } catch (error) {
    if (error instanceof Error && error.message === "idempotency_key_reuse") {
      const raced = await getIdempotentResponse<T>(db, ownerId, key, hash);
      if (raced) return raced;
    }
    throw error;
  }
  return response;
}
