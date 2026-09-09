import type { FastifyRequest } from "fastify";
import type { Db } from "../db/client.js";

export type Auth = { userId: string; token: string };

export async function requireAuth(db: Db, request: FastifyRequest): Promise<Auth> {
  const raw = request.headers.authorization;
  if (!raw?.startsWith("Bearer ")) throw new Error("unauthorized");
  const token = raw.slice(7).trim();
  if (!token) throw new Error("unauthorized");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("unauthorized");
  return { userId: data.user.id, token };
}
