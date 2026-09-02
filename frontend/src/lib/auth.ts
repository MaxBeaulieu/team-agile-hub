/**
 * Client-side session handling. Replaces `@supabase/supabase-js` /
 * `@supabase/ssr` entirely.
 *
 * Temporary stand-in until Phase 2 (Entra ID SSO) lands — see
 * SELFHOST_MIGRATION_PLAN.md. `login()` signs in as one fixed backend test
 * account (`POST /api/auth/dev-login`), not a real per-person identity. The
 * whole session — including the access token — lives in one plain,
 * JS-readable cookie (not httpOnly): there's no rotating-refresh-token flow
 * yet, so there's nothing for an httpOnly cookie to protect beyond what a
 * long-lived bearer token already exposes. `proxy.ts` (edge middleware)
 * reads the same cookie to gate routes without a network round-trip.
 *
 * Empty-string default: in Docker the frontend Dockerfile deliberately bakes
 * no NEXT_PUBLIC_API_URL, so auth requests go to a same-origin relative path
 * and Caddy's `/api/*` route (see Caddyfile) forwards them to the backend.
 * Local `npm run dev` (outside Docker) sets NEXT_PUBLIC_API_URL in
 * frontend/.env.local instead, since there's no Caddy in front of it there.
 */
"use client";

import { SESSION_COOKIE } from "@/lib/session-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export { SESSION_COOKIE };

export type AppSession = {
  accessToken: string;
  expiresAt: string;
  userId: string;
  email: string | null;
  displayName: string;
  isAnonymous: boolean;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${Math.max(0, maxAgeSeconds)}; samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function getSession(): AppSession | null {
  const raw = readCookie(SESSION_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

function storeSession(session: AppSession) {
  const maxAge = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
  writeCookie(SESSION_COOKIE, JSON.stringify(session), maxAge);
}

async function postAuth(path: string): Promise<AppSession> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`Auth ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const session: AppSession = {
    accessToken: body.accessToken,
    expiresAt: body.expiresAt,
    userId: body.userId,
    email: body.email,
    displayName: body.displayName,
    isAnonymous: body.isAnonymous,
  };
  storeSession(session);
  return session;
}

/** Stand-in for Entra sign-in (Phase 2 TODO) — signs in as the fixed test account. */
export const login = () => postAuth("/api/auth/dev-login");

/** Replaces supabase.auth.signInAnonymously(). */
export const guestJoin = () => postAuth("/api/auth/guest");

/** Replaces supabase.auth.signOut(). Client-side only — no server-side revocation
 * exists yet (there's no refresh-token store to invalidate against). */
export function logout() {
  clearCookie(SESSION_COOKIE);
}
