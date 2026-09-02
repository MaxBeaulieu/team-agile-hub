/**
 * Server Component session reader — replaces `@/lib/supabase/server`. The
 * session cookie (see lib/session-cookie.ts / lib/auth.ts) holds the whole
 * session as plain JSON, so a Server Component can read it directly with
 * `next/headers` cookies() without a network round-trip to the backend.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { AppSession } from "@/lib/auth";

export async function getServerSession(): Promise<AppSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}
