'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ArrowRight, Clock, Zap, CheckCircle2 } from 'lucide-react'
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
          <h1 className="text-sm font-semibold">Sprint Retro</h1>
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
      <main className="flex-1 overflow-y-auto p-6">
        {loadingSprints ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
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
          <div className="space-y-2 max-w-3xl mx-auto">
            {eligible.map((sprint) => {
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
            })}
          </div>
        )}
      </main>
    </div>
  )
}
