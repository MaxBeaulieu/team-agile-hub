/**
 * Shared between `lib/auth.ts` (client-side session helpers) and `proxy.ts`
 * (edge middleware) — kept in its own file with no `"use client"` directive
 * so middleware doesn't pull in client-component bundling semantics just to
 * read a constant.
 */
export const SESSION_COOKIE = "app_session";
