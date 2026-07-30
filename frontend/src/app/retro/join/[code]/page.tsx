'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, LogIn, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { toast } from 'sonner'

type JoinTarget = {
  sessionId: string
  retroName: string
  phase: string
  teamId: string | null
  sprintId: string | null
  isQuickRetro: boolean
}

type JoinResult = JoinTarget & { participantId: string; displayName: string }

// Sprint retros live on the team/sprint-scoped dashboard route; quick retros
// have their own standalone route.
function retroSessionUrl(target: JoinTarget) {
  return target.isQuickRetro
    ? `/quickretro/${target.sessionId}`
    : `/dashboard/retro?sprintId=${target.sprintId}&teamId=${target.teamId ?? ''}`
}

function storageKey(code: string) {
  return `retro-invite-${code}`
}

export default function RetroJoinPage() {
  const params = useParams<{ code: string }>()
  const code = params.code
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<JoinTarget | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [joining, setJoining] = useState(false)

  const join = useCallback(
    async (name?: string) => {
      const result = await api.post<JoinResult>(
        `/api/retro/join/${code}`,
        name ? { displayName: name } : {},
      )
      localStorage.setItem(storageKey(code), result.participantId)
      return result
    },
    [code],
  )

  // Resolve the invite, then decide whether we can walk the user straight in.
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const target = await api.get<JoinTarget>(`/api/retro/join/${code}`)
        if (cancelled) return
        setPreview(target)

        const { data: { session } } = await supabase.auth.getSession()
        const signedIn = !!session && !session.user.is_anonymous

        if (signedIn) {
          try {
            const result = await join()
            if (!cancelled) router.replace(retroSessionUrl(result))
          } catch (err) {
            if (!cancelled) {
              toast.error(err instanceof Error ? err.message : 'Failed to join retro')
            }
          }
          return
        }

        // Returning guest on this browser — straight back in.
        if (session && localStorage.getItem(storageKey(code))) {
          router.replace(retroSessionUrl(target))
          return
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [code, router, supabase, join])

  async function handleSignIn() {
    // Drop any throwaway anonymous session first, otherwise the sign-in form
    // would run on top of it.
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user.is_anonymous) await supabase.auth.signOut()
    localStorage.removeItem(storageKey(code))
    router.push(`/auth/login?next=${encodeURIComponent(`/retro/join/${code}`)}`)
  }

  async function handleGuestJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!preview || !displayName.trim()) return

    setJoining(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }

      const result = await join(displayName.trim())
      toast.success(`Joined as ${result.displayName}`)
      router.replace(retroSessionUrl(result))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join retro')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold text-muted-foreground">
          Team Agile Hub
        </span>
        <ThemeSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {loading ? (
            <div className="flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : notFound || !preview ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-1.5 shadow-sm">
              <p className="text-sm font-semibold">This invite link is invalid</p>
              <p className="text-xs text-muted-foreground">
                Ask the host to send you a fresh invite link.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
              <div className="text-center space-y-1.5">
                <Users className="size-6 mx-auto text-primary" />
                <h1 className="text-lg font-semibold">Join {preview.retroName}</h1>
                <p className="text-xs text-muted-foreground">
                  Sign in to join with your account, or continue as a guest.
                </p>
              </div>

              <Button variant="outline" className="w-full gap-1.5" onClick={handleSignIn}>
                <LogIn className="size-3.5" />
                Sign in
              </Button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleGuestJoin} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="display-name">Your name</Label>
                  <Input
                    id="display-name"
                    placeholder="e.g. Alex"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                    autoFocus
                    maxLength={60}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={joining || !displayName.trim()}>
                  {joining ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  Continue as guest
                </Button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
