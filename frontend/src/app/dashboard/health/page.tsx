'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, CheckCircle2, Clock, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
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
  active:    { label: 'Active',    className: 'bg-green-500/10 text-green-500 border-green-500/20', Icon: Zap },
  planning:  { label: 'Planning',  className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',   Icon: Clock },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-transparent',  Icon: CheckCircle2 },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HealthListPage() {
  const router = useRouter()

  const [teams,          setTeams]          = useState<Team[]>([])
  const [teamId,         setTeamId]         = useState('')
  const [sprints,        setSprints]        = useState<Sprint[]>([])
  const [loadingTeams,   setLoadingTeams]   = useState(true)
  const [loadingSprints, setLoadingSprints] = useState(false)

  // Load teams on mount
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // Load sprints when team changes
  const loadSprints = useCallback(async (id: string) => {
    if (!id) return
    setLoadingSprints(true)
    try {
      const data = await api.get<Sprint[]>(`/api/teams/${id}/sprints`)
      // Sort: active first, then planning, then completed (desc by start date within each group)
      const order: SprintStatus[] = ['active', 'planning', 'completed']
      data.sort((a, b) => {
        const diff = order.indexOf(a.status) - order.indexOf(b.status)
        if (diff !== 0) return diff
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      })
      setSprints(data)
    } catch {
      toast.error('Failed to load sprints')
    } finally {
      setLoadingSprints(false)
    }
  }, [])

  useEffect(() => {
    if (teamId) loadSprints(teamId)
    else setSprints([])
  }, [teamId, loadSprints])

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Sprint Health</h1>
        </div>

        {!loadingTeams && teams.length > 0 && (
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Select a team…" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-6">
        {loadingTeams ? (
          <EmptyState message="Loading teams…" />
        ) : teams.length === 0 ? (
          <EmptyState message="Create a team first." />
        ) : !teamId ? (
          <EmptyState message="Select a team above to see its sprints." />
        ) : loadingSprints ? (
          <EmptyState message="Loading sprints…" />
        ) : sprints.length === 0 ? (
          <EmptyState message="No sprints found for this team." />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
            {sprints.map((sprint) => {
              const cfg = STATUS_CONFIG[sprint.status]
              const Icon = cfg.Icon
              return (
                <button
                  key={sprint.id}
                  onClick={() => router.push(`/dashboard/sprints/${sprint.id}/health?teamId=${teamId}`)}
                  className="flex items-center gap-4 px-5 py-4 text-left hover:bg-accent transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{sprint.name}</span>
                      <Badge
                        variant="outline"
                        className={`h-5 gap-1 px-1.5 text-[10px] font-medium ${cfg.className}`}
                      >
                        <Icon className="size-2.5" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
                      </span>
                    </div>
                    {sprint.goal && (
                      <p className="text-xs text-muted-foreground/70 truncate mt-0.5 max-w-md">
                        {sprint.goal}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}
