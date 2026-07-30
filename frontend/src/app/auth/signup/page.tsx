'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { Mail } from 'lucide-react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      })
      if (error) setError(error.message)
      else setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Supabase. Check your network and env config.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-card">
            <Mail className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{' '}
            <span className="text-foreground font-medium">{email}</span>.
            Click it to activate your account.
          </p>
          <Link href="/auth/login" className="text-sm text-primary hover:underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          PR Patrol<br />Command Center
        </Link>
        <ThemeSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Free forever for small teams</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <form onSubmit={handleSignup} className="space-y-3">
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-xs font-medium text-muted-foreground">Display name</label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
