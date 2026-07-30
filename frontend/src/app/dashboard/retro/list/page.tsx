'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ArrowRight, Clock, Zap, CheckCircle2, Plus, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type SprintStatus = 'planning' | 'active' | 'completed'

type Sprint = {
  id: string
  name: string
  goal: string | null
  startDate: string
  endDate: string
  status: SprintStatus
}

type Team = { id: string; name: string }

type RetroPhase =
  | 'CheckIn' | 'Icebreaker' | 'Write' | 'Group'
  | 'Vote' | 'Discuss' | 'WrapUp' | 'Completed'

type QuickRetro = {
  id: string
  name: string
  phase: RetroPhase
  createdAt: string
}

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

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SprintStatus, { label: string; className: string; Icon: React.ElementType }> = {
  planning:  { label: 'Planning',  className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',   Icon: Clock },
  active:    { label: 'Active',    className: 'bg-green-500/10 text-green-500 border-green-500/20', Icon: Zap },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-transparent',  Icon: CheckCircle2 },
}

const RETRO_ELIGIBLE: SprintStatus[] = ['active', 'completed']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RetroListPage() {
  const [teams, setTeams]               = useState<Team[]>([])
  const [teamId, setTeamId]             = useState('')
  const [sprints, setSprints]           = useState<Sprint[]>([])
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingSprints, setLoadingSprints] = useState(false)
  const [quickRetros, setQuickRetros]   = useState<QuickRetro[]>([])
  const [loadingQuick, setLoadingQuick]  = useState(true)

  // Quick retros aren't tied to a team, so they load independently of the
  // team selector.
  useEffect(() => {
    api.get<QuickRetro[]>('/api/quickretro')
      .then(data => setQuickRetros(
        [...data].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      ))
      .catch(() => toast.error('Failed to load quick retros'))
      .finally(() => setLoadingQuick(false))
  }, [])

  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length > 0) setTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  const loadSprints = useCallback(async () => {
    if (!teamId) return
    setLoadingSprints(true)
    try {
      const data = await api.get<Sprint[]>(`/api/teams/${teamId}/sprints`)
      setSprints([...data].sort((a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      ))
    } catch {
      toast.error('Failed to load sprints')
    } finally {
      setLoadingSprints(false)
    }
  }, [teamId])

  useEffect(() => { loadSprints() }, [loadSprints])

  // Only active/completed sprints can have a retro
  const eligible = sprints.filter(s => RETRO_ELIGIBLE.includes(s.status))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Retro</h1>
          {!loadingSprints && eligible.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {eligible.length}
            </span>
          )}
        </div>

        {!loadingTeams && teams.length > 1 && (
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {/* List */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Quick retros — not tied to a team or sprint */}
        <section className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quick retros
            </h2>
            <Link
              href="/quickretro"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="size-3" />
              New quick retro
            </Link>
          </div>

          {loadingQuick ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : quickRetros.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No quick retros yet.{' '}
              <Link href="/quickretro" className="underline">Create one</Link>
              {' '}to run a retro without a team or sprint.
            </p>
          ) : (
            quickRetros.map((retro) => (
              <div
                key={retro.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium truncate">{retro.name}</span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium shrink-0 text-muted-foreground">
                      {PHASE_LABELS[retro.phase]}
                    </span>
                  </div>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" />
                    {fmtDate(retro.createdAt)}
                  </p>
                </div>

                <Link
                  href={`/quickretro/${retro.id}`}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                >
                  Open Retro
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ))
          )}
        </section>

        {/* Sprint retros */}
        <section className="max-w-3xl mx-auto space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sprint retros
          </h2>

          {loadingSprints ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : !loadingTeams && eligible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-center">
              <p className="text-sm text-muted-foreground">No eligible sprints found.</p>
              <p className="text-xs text-muted-foreground">
                Retros are available for active and completed sprints.{' '}
                <Link href="/dashboard/sprints" className="underline">Go to Sprints</Link>
                {' '}to get started.
              </p>
            </div>
          ) : (
            eligible.map((sprint) => {
              const { label, className, Icon } = STATUS_CONFIG[sprint.status]
              return (
                <div
                  key={sprint.id}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{sprint.name}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${className}`}>
                        <Icon className="size-2.5" />
                        {label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
                    </p>
                    {sprint.goal && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{sprint.goal}</p>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/retro?sprintId=${sprint.id}&teamId=${teamId}`}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Open Retro
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )
            })
          )}
        </section>
      </main>
    </div>
  )
}
