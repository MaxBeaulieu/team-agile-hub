import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

function getSafeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

// Presence-only check: the session cookie holds the whole session (including
// the access token) as plain JSON — see lib/auth.ts. Route gating here just
// decides whether to redirect to /auth/login, so a presence check is enough;
// signature/expiry validation happens per-request on the backend regardless,
// same as before this rewrite (defense in depth already lived there, not in
// middleware). No Supabase (or any auth SDK) involved here anymore.
export async function proxy(request: NextRequest) {
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;

  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");
  const isRetroJoinRoute = request.nextUrl.pathname.startsWith("/retro/join");
  const isPublicRoute = request.nextUrl.pathname === "/" || isRetroJoinRoute;

  if (!hasSession && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", requested);
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthRoute) {
    const next = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    if (next) {
      return NextResponse.redirect(new URL(next, request.url));
    }

    const fallback = request.nextUrl.clone();
    fallback.pathname = "/dashboard";
    return NextResponse.redirect(fallback);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
