'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { CheckInPanel } from './checkin-panel'
import { IcebreakerPanel } from './icebreaker-panel'
import { WritePanel } from './write-panel'
import { GroupPanel } from './group-panel'
import { VotePanel } from './vote-panel'
import { DiscussPanel } from './discuss-panel'
import { WrapUpPanel } from './wrapup-panel'
import { ParticipantsBar } from '@/components/retro/participants-bar'
import { useRetroRoster } from '@/components/retro/use-retro-roster'
import type { RetroParticipantData } from '@/components/retro/types'

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type RetroPhase =
  | 'CheckIn' | 'Icebreaker' | 'Write' | 'Group'
  | 'Vote' | 'Discuss' | 'WrapUp' | 'Completed'

export type RetroSession = {
  id: string
  sprintId: string
  facilitatorId: string | null
  phase: RetroPhase
  columnsJson: string
  voteCount: number
  hideVotesUntilRevealed: boolean
  currentSpeakerId: string | null
  speakerOrderJson: string | null
  icebreakerQuestion: string | null
  activeDiscussionCardId: string | null
  createdAt: string
}

export type RetroVote = {
  id: string
  retroCardId: string
  userId: string
  count: number
}

export type RetroCard = {
  id: string
  retroSessionId: string
  authorId: string
  column: string
  content: string
  groupId: string | null
  groupLabel: string | null
  discussionNotes: string | null
  isRevealed: boolean
  isDiscussed: boolean
  createdAt: string
  retro_votes: RetroVote[]
}

export type MoodCheckin = {
  id: string
  retroSessionId: string
  userId: string
  entryMood: number | null
  exitMood: number | null
}

export type TeamMemberData = {
  id: string
  teamId: string
  userId: string
  displayName: string
  role: string
  joinedAt: string
}

export type ActionItemData = {
  id: string
  sprintId: string
  type: string
  assigneeId: string | null
  text: string
  dueDate: string | null
  status: string
  createdAt: string
  retroCardId: string | null
}

export type RetroData = {
  session: RetroSession
  cards: RetroCard[]
  hiddenCounts: Record<string, number>
  moodCheckins: MoodCheckin[]
  teamMembers: TeamMemberData[]
  actionItems: ActionItemData[]
  participants: RetroParticipantData[]
  sprintName: string
}

// ─── Phase config ─────────────────────────────────────────────────────────────

const PHASE_ORDER: RetroPhase[] = [
  'CheckIn', 'Icebreaker', 'Write', 'Group', 'Vote', 'Discuss', 'WrapUp', 'Completed',
]

const PHASE_LABELS: Record<RetroPhase, string> = {
  CheckIn:    'Check-In',
  Icebreaker: 'Icebreaker',
  Write:      'Write',
  Group:      'Group',
  Vote:       'Vote',
  Discuss:    'Discuss',
  WrapUp:     'Wrap-Up',
  Completed:  'Completed',
}

// ─── Phase Progress Bar ───────────────────────────────────────────────────────

function PhaseProgressBar({ phase }: { phase: RetroPhase }) {
  const current = PHASE_ORDER.indexOf(phase)
  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.filter(p => p !== 'Completed').map((p, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <div key={p} className="flex items-center gap-1">
            <div
              className={[
                'h-1.5 rounded-full transition-all',
                active  ? 'w-10 bg-primary' :
                done    ? 'w-6 bg-primary/40' :
                          'w-6 bg-muted',
              ].join(' ')}
            />
            {i < PHASE_ORDER.filter(p => p !== 'Completed').length - 1 && (
              <div className="h-px w-2 bg-border" />
            )}
          </div>
        )
      })}
      <span className="ml-2 text-xs text-muted-foreground font-medium">
        {PHASE_LABELS[phase]}
      </span>
    </div>
  )
}

// ─── Facilitator Advance Bar ──────────────────────────────────────────────────

const PHASE_NEXT_LABEL: Partial<Record<RetroPhase, string>> = {
  CheckIn:    'Start Icebreaker →',
  Icebreaker: 'Start Writing →',
  Write:      'Reveal & Group Cards →',
  Group:      'Start Voting →',
  Vote:       'Start Discussion →',
  Discuss:    'Wrap Up →',
  WrapUp:     'Complete Retro',
}

function FacilitatorBar({
  session, teamId, checkedInCount, totalMembers, votedCount, onRefresh,
}: {
  session: RetroSession
  teamId: string
  checkedInCount: number
  totalMembers: number
  votedCount: number
  onRefresh: () => void
}) {
  const [advancing, setAdvancing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const label = PHASE_NEXT_LABEL[session.phase]
  if (!label || session.phase === 'Completed') return null

  // Show a warning if not everyone is ready for certain phases
  const warnCheckin = session.phase === 'CheckIn' && checkedInCount < totalMembers
  const warnVote    = session.phase === 'Vote' && votedCount < totalMembers

  function handleAdvanceClick() {
    if (warnCheckin || warnVote) {
      setConfirmOpen(true)
    } else {
      doAdvance()
    }
  }

  async function doAdvance() {
    setConfirmOpen(false)
    setAdvancing(true)
    try {
      await api.post(`/api/teams/${teamId}/retro/${session.id}/advance`, {})
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance phase')
    } finally {
      setAdvancing(false)
    }
  }

  const warnMsg = warnCheckin
    ? `${totalMembers - checkedInCount} member(s) haven't checked in yet.`
    : `${totalMembers - votedCount} member(s) haven't finished voting yet.`

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-2">
        <span className="text-xs text-muted-foreground">You are the facilitator</span>
        <Button
          size="sm"
          className="h-7 text-xs px-4"
          onClick={handleAdvanceClick}
          disabled={advancing}
        >
          {advancing ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
          {label}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Advance phase?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{warnMsg} Advance anyway?</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Wait
            </Button>
            <Button size="sm" onClick={doAdvance}>
              Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Retro Header ─────────────────────────────────────────────────────────────

function RetroHeader({
  sprintName, session,
}: {
  sprintName: string
  session: RetroSession
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/sprints"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-sm font-semibold">{sprintName} — Retro</h1>
          <PhaseProgressBar phase={session.phase} />
        </div>
      </div>
    </div>
  )
}

// ─── No Session State ─────────────────────────────────────────────────────────

function NoRetroSession({
  teamId, sprintId, sprintName, onCreated,
}: {
  teamId: string
  sprintId: string
  sprintName: string
  onCreated: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [columns, setColumns]  = useState('Went Well, Improve, Learnings, Questions')
  const [votes, setVotes]      = useState(5)
  const [hideVotes, setHideVotes] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const cols = columns.split(',').map(c => c.trim()).filter(Boolean)
      await api.post(`/api/teams/${teamId}/sprints/${sprintId}/retro`, {
        columnsJson: JSON.stringify(cols),
        voteCount: votes,
        hideVotesUntilRevealed: hideVotes,
      })
      setOpen(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create retro')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-3 max-w-sm">
        <p className="text-lg font-semibold">{sprintName}</p>
        <p className="text-sm text-muted-foreground">
          No retro session has been created for this sprint yet.
        </p>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" /> Start Retro
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start Retro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Columns (comma-separated)
              </label>
              <input
                value={columns}
                onChange={e => setColumns(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Votes per person: <span className="text-foreground font-semibold">{votes}</span>
              </label>
              <input
                type="range" min={1} max={10} value={votes}
                onChange={e => setVotes(Number(e.target.value))}
                className="w-full accent-primary h-1.5"
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hideVotes}
                onChange={e => setHideVotes(e.target.checked)}
                className="accent-primary"
              />
              Hide votes until facilitator reveals
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={creating}>
              {creating ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Retro Inner (loads data, subscriptions) ──────────────────────────────────

function RetroInner({ teamId, sprintId }: { teamId: string; sprintId: string }) {
  const [data, setData]         = useState<RetroData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false) // 404 = no session yet
  const [currentUserId, setCurrentUserId] = useState<string>('')
  // Sprint name cached across 404 state
  const sprintNameRef = useRef<string>('Sprint')

  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const result = await api.get<RetroData>(
        `/api/teams/${teamId}/sprints/${sprintId}/retro`
      )
      sprintNameRef.current = result.sprintName
      setData(result)
      setNotFound(false)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('404')) {
        setNotFound(true)
        setData(null)
        // Try to load sprint name for display
        try {
          const sprint = await api.get<{ name: string }>(
            `/api/teams/${teamId}/sprints/${sprintId}`
          )
          sprintNameRef.current = sprint.name
        } catch { /* ignore */ }
      } else {
        toast.error('Failed to load retro')
      }
    } finally {
      setLoading(false)
    }
  }, [teamId, sprintId])

  // Get current user ID from Supabase session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.id) setCurrentUserId(session.user.id)
    })
  }, [])

  // Initial load
  useEffect(() => { load() }, [load])

  // Supabase Realtime subscriptions — refetch on any change
  useEffect(() => {
    if (!data?.session.id) return

    const sessionId = data.session.id
    // Debounce rapid batches (e.g. bulk vote saves)
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(load, 300)
    }

    const channel = supabase
      .channel(`retro:${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'retro_sessions',
        filter: `id=eq.${sessionId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'retro_cards',
        filter: `retro_session_id=eq.${sessionId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'retro_votes',
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mood_checkins',
        filter: `retro_session_id=eq.${sessionId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'action_items',
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'retro_participants',
        filter: `retro_session_id=eq.${sessionId}`,
      }, scheduleRefresh)
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
    }
  }, [data?.session.id, load])

  // Roster = everyone who joined this retro *and* currently has it open.
  // Hooks must run before the early returns below.
  const participants = useMemo(() => data?.participants ?? [], [data])
  const roster = useRetroRoster(data?.session.id ?? null, participants, currentUserId)

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <>
        {/* Still show a light header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <Link href="/dashboard/sprints" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-sm font-semibold">{sprintNameRef.current} — Retro</h1>
        </div>
        <NoRetroSession
          teamId={teamId}
          sprintId={sprintId}
          sprintName={sprintNameRef.current}
          onCreated={load}
        />
      </>
    )
  }

  const { session, cards, hiddenCounts, moodCheckins, teamMembers, actionItems, sprintName } = data
  const isFacilitator = session.facilitatorId === currentUserId

  // Progress is measured against the people actually in the retro right now,
  // so invite-link guests count and absent team members don't.
  const rosterUserIds = new Set(roster.map(m => m.userId))
  const checkedInCount = new Set(
    moodCheckins
      .filter(m => m.entryMood !== null && rosterUserIds.has(m.userId))
      .map(m => m.userId)
  ).size
  const votedMembers = new Set(
    cards.flatMap(c => c.retro_votes.map(v => v.userId)).filter(id => rosterUserIds.has(id))
  ).size

  const panelProps = {
    session, cards, hiddenCounts, moodCheckins, teamMembers, roster,
    actionItems: actionItems ?? [],
    sprintName,
    currentUserId, teamId, isFacilitator, onRefresh: load,
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <RetroHeader sprintName={sprintName} session={session} />

      <ParticipantsBar
        sessionId={session.id}
        roster={roster}
        isHost={isFacilitator}
        onRosterChange={load}
      />

      {isFacilitator && (
        <FacilitatorBar
          session={session}
          teamId={teamId}
          checkedInCount={checkedInCount}
          totalMembers={roster.length}
          votedCount={votedMembers}
          onRefresh={load}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {session.phase === 'CheckIn'    && <CheckInPanel    {...panelProps} />}
        {session.phase === 'Icebreaker' && <IcebreakerPanel {...panelProps} />}
        {session.phase === 'Write'      && <WritePanel      {...panelProps} />}
        {session.phase === 'Group'      && <GroupPanel      {...panelProps} />}
        {session.phase === 'Vote'       && <VotePanel       {...panelProps} />}
        {session.phase === 'Discuss'    && <DiscussPanel    {...panelProps} />}
        {session.phase === 'WrapUp'     && <WrapUpPanel     {...panelProps} />}
        {session.phase === 'Completed'  && (
          <>
            <div className="px-6 py-2 border-b border-border bg-muted/40">
              <p className="text-xs text-muted-foreground text-center">
                This retro is complete — read-only summary
              </p>
            </div>
            <WrapUpPanel {...panelProps} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RetroPageContent() {
  const params   = useSearchParams()
  const router   = useRouter()
  const teamId   = params.get('teamId')
  const sprintId = params.get('sprintId')

  useEffect(() => {
    if (!teamId || !sprintId) router.replace('/dashboard/retro/list')
  }, [teamId, sprintId, router])

  if (!teamId || !sprintId) return null

  return <RetroInner teamId={teamId} sprintId={sprintId} />
}

export default function RetroPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    }>
      <RetroPageContent />
    </Suspense>
  )
}
