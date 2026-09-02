"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { login } from "@/lib/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

function getSafeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

function LoginPageInner() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const successRedirect = nextPath ?? "/dashboard";

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await login();
      router.push(successRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Command Center
        </Link>
        <ThemeSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to your account
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Signing in..." : "Continue with test account"}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              Temporary sign-in -- Microsoft Entra ID SSO replaces this once Phase 2
              of the self-host migration lands.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}