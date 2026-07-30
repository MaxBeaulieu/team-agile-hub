'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { toast } from 'sonner'

type JoinPreview = { sessionId: string; phase: string; teamId: string | null; sprintId: string }

// Today the retro view is still team/sprint-scoped (the standalone retro route
// is a separate in-flight change), so we redirect into the existing working
// route using the teamId/sprintId the join/preview endpoints resolve from the
// session. Once the standalone route lands, this can drop teamId/sprintId.
function retroSessionUrl(teamId: string | null, sprintId: string) {
  return `/dashboard/retro?sprintId=${sprintId}&teamId=${teamId ?? ''}`
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
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [joining, setJoining] = useState(false)

  // Load the public preview, then figure out whether we can rejoin silently.
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const result = await api.get<JoinPreview>(`/api/retro/join/${code}`)
        if (cancelled) return
        setPreview(result)

        const cached = localStorage.getItem(storageKey(code))
        const { data: { session } } = await supabase.auth.getSession()

        if (cached && session) {
          // Already joined this link before in this browser — go straight in.
          router.replace(retroSessionUrl(result.teamId, result.sprintId))
          return
        }

        setHasSession(!!session)
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [code, router, supabase])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!preview || !displayName.trim()) return

    setJoining(true)
    try {
      if (!hasSession) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }

      const result = await api.post<{ sessionId: string; participantId: string; teamId: string | null; sprintId: string }>(
        `/api/retro/join/${code}`,
        { displayName: displayName.trim() }
      )

      localStorage.setItem(storageKey(code), result.participantId)
      toast.success(`Joined as ${displayName.trim()}`)
      router.replace(retroSessionUrl(result.teamId, result.sprintId))
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
                <h1 className="text-lg font-semibold">Join this retro</h1>
                <p className="text-xs text-muted-foreground">
                  Enter your name to join — no account required.
                </p>
              </div>

              <form onSubmit={handleJoin} className="space-y-3">
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
                  Join retro
                </Button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
