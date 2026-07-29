'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Spade } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { TicketSidebar } from './ticket-sidebar'
import { VotingArea } from './voting-area'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PokerSessionStatus = 'Pending' | 'InProgress' | 'Completed'
export type PokerDeckType      = 'Fibonacci' | 'TShirt' | 'Custom'

export type PokerSession = {
  id: string
  sprintId: string
  deckType: PokerDeckType
  customDeckJson: string | null
  facilitatorId: string | null
  status: PokerSessionStatus
  currentTicketId: string | null
  createdAt: string
}

export type PokerVote = {
  id: string
  pokerTicketId: string
  userId: string
  estimate: string
  revealedAt: string | null
}

export type PokerTicket = {
  id: string
  pokerSessionId: string
  title: string
  description: string | null
  jiraIssueId: string | null
  finalPoints: number | null
  votesRevealed: boolean
  order: number
  votes: PokerVote[]
}

export type TeamMemberData = {
  id: string
  teamId: string
  userId: string
  displayName: string
  role: string
}

export type PokerData = {
  session: PokerSession
  tickets: PokerTicket[]
  teamMembers: TeamMemberData[]
  sprintName: string
  deck: string[]
}

type Team = { id: string; name: string }

// ─── Deck type selector label ─────────────────────────────────────────────────

const DECK_LABELS: Record<PokerDeckType, string> = {
  Fibonacci: 'Fibonacci (1,2,3,5,8…)',
  TShirt:    'T-Shirt (XS-XL)',
  Custom:    'Custom',
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function PokerPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const sprintId     = searchParams.get('sprintId')
  const teamId       = searchParams.get('teamId')

  const [data, setData]                   = useState<PokerData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [creating, setCreating]           = useState(false)
  const [selectedDeck, setSelectedDeck]   = useState<PokerDeckType>('Fibonacci')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Redirect to list if no params
  useEffect(() => {
    if (!sprintId || !teamId) router.replace('/dashboard/poker/list')
  }, [sprintId, teamId, router])

  // Load current user id
  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      setCurrentUserId(d.user?.id ?? null)
    })
  }, [])

  const load = useCallback(async () => {
    if (!sprintId || !teamId) return
    try {
      const d = await api.get<PokerData>(`/api/teams/${teamId}/sprints/${sprintId}/poker`)
      setData(d)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('404')) {
        setData(null) // session not created yet
      } else {
        toast.error('Failed to load poker session')
      }
    } finally {
      setLoading(false)
    }
  }, [sprintId, teamId])

  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    if (!sprintId) return
    const supabase = createClient()

    function debouncedRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(load, 300)
    }

    const channel = supabase
      .channel(`poker:${sprintId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_sessions' },  debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tickets' },   debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_votes' },     debouncedRefresh)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sprintId, load])

  async function createSession() {
    if (!sprintId || !teamId) return
    setCreating(true)
    try {
      await api.post(`/api/teams/${teamId}/sprints/${sprintId}/poker`, { deckType: selectedDeck })
      await load()
    } catch {
      toast.error('Failed to create poker session')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/poker/list">
            <Button variant="ghost" size="icon" className="size-7">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <Spade className="size-4 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              {data?.sprintName ?? 'Planning Poker'}
            </h1>
            {data && (
              <p className="text-[10px] text-muted-foreground">
                {DECK_LABELS[data.session.deckType]} · {data.session.status}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Session not yet created */}
      {!data ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center">
          <Spade className="size-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-semibold">No poker session yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a session to start estimating tickets with your team.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedDeck}
              onValueChange={v => setSelectedDeck(v as PokerDeckType)}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Fibonacci" className="text-xs">Fibonacci (1,2,3,5,8…)</SelectItem>
                <SelectItem value="TShirt"    className="text-xs">T-Shirt (XS-XL)</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={createSession} disabled={creating}>
              {creating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              {creating ? 'Creating…' : 'Create Session'}
            </Button>
          </div>
        </div>
      ) : currentUserId === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <TicketSidebar
            data={data}
            teamId={teamId!}
            sessionId={data.session.id}
            currentUserId={currentUserId}
            onRefresh={load}
          />
          <VotingArea
            data={data}
            teamId={teamId!}
            sessionId={data.session.id}
            currentUserId={currentUserId}
            onRefresh={load}
          />
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function PokerPage() {
  return (
    <Suspense>
      <PokerPageInner />
    </Suspense>
  )
}
