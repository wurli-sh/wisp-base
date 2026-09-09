"use client";

import { apiFetch, type MeResponse } from "@/lib/api/client";
import { AUTH_NEXT_COOKIE } from "@/lib/app-origin";
import { userFacingError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export const AUTH_SESSION_EVENT = "wisp-session";
export type { MeResponse };

const ME_CACHE_MS = 2_000;

type ApiOk<T> = { ok: true; status: number; data: T };
type ApiErr = { ok: false; status: number; data?: undefined; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

let cachedMe: { expiresAt: number; result: ApiResult<MeResponse> } | undefined;
let meInFlight: Promise<ApiResult<MeResponse>> | undefined;
let syncInFlight: Promise<unknown> | undefined;

export function notifySessionChanged() {
  cachedMe = undefined;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function refreshSupabaseSession() {
  const supabase = createClient();
  await supabase.auth.refreshSession();
}

async function fetchMeWithToken(access: string | null): Promise<ApiResult<MeResponse>> {
  if (!access) return { ok: false, status: 401, error: "unauthorized" };
  try {
    const data = await apiFetch<MeResponse>("/v1/me", { token: access });
    return { ok: true, status: 200, data };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "me_failed";
    if (raw === "unauthorized" || raw.includes("401")) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.refreshSession();
        const refreshed = data.session?.access_token;
        if (error || !refreshed) return { ok: false, status: 401, error: "unauthorized" };
        const retry = await apiFetch<MeResponse>("/v1/me", { token: refreshed });
        return { ok: true, status: 200, data: retry };
      } catch {
        return { ok: false, status: 401, error: "unauthorized" };
      }
    }
    return { ok: false, status: 500, error: raw };
  }
}

export async function fetchMe(token?: string | null): Promise<ApiResult<MeResponse>> {
  if (token !== undefined) return fetchMeWithToken(token);
  if (cachedMe && cachedMe.expiresAt > Date.now()) return cachedMe.result;
  if (meInFlight) return meInFlight;
  meInFlight = (async () => {
    const result = await fetchMeWithToken(await getAccessToken());
    cachedMe = { result, expiresAt: Date.now() + ME_CACHE_MS };
    return result;
  })();
  try {
    return await meInFlight;
  } finally {
    meInFlight = undefined;
  }
}

export function clearSupabaseBrowserCookies(): void {
  if (typeof document === "undefined") return;
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name) continue;
    if (name.startsWith("sb-") || name === AUTH_NEXT_COOKIE) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
}

export function clearStaleSupabaseLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("sb-")) localStorage.removeItem(key);
  }
}

/** Single in-flight session sync against /v1/session/sync. */
export async function syncWispSession(): Promise<unknown> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const token = await getAccessToken();
    if (!token) return null;
    const data = await apiFetch("/v1/session/sync", { method: "POST", token, body: {} });
    cachedMe = undefined;
    notifySessionChanged();
    return data;
  })().finally(() => {
    syncInFlight = undefined;
  });
  return syncInFlight;
}

export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } finally {
    clearSupabaseBrowserCookies();
    cachedMe = undefined;
    notifySessionChanged();
  }
}

export async function sendEmailOtp(email: string): Promise<{ error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) return { error: userFacingError(error, "Could not send code") };
    return {};
  } catch (e) {
    return { error: userFacingError(e, "Could not send code") };
  }
}

export async function verifyEmailOtp(email: string, token: string): Promise<{ error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: "email",
    });
    if (error) return { error: userFacingError(error, "Invalid code") };
    await syncWispSession();
    return {};
  } catch (e) {
    return { error: userFacingError(e, "Invalid code") };
  }
}
