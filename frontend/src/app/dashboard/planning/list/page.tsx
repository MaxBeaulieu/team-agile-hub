'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, Plus, ArrowRight, Clock, Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanningListPage() {
  const router = useRouter()

  const [teams, setTeams]               = useState<Team[]>([])
  const [teamId, setTeamId]             = useState('')
  const [sprints, setSprints]           = useState<Sprint[]>([])
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingSprints, setLoadingSprints] = useState(false)
  const [dialogOpen, setDialogOpen]     = useState(false)
  const [pickId, setPickId]             = useState('')

  // Load teams on mount
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length > 0) setTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // Load sprints whenever team changes
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

  // Only sprints in 'planning' status are eligible for a new planning session
  const unstarted = sprints.filter((s) => s.status === 'planning')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Sprint Planning</h1>
          {!loadingSprints && sprints.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {sprints.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={loadingTeams || !teamId}
            onClick={() => { setPickId(''); setDialogOpen(true) }}
          >
            <Plus className="size-3.5" />
            New Planning
          </Button>
        </div>
      </header>

      {/* List */}
      <main className="flex-1 overflow-y-auto p-6">
        {loadingSprints ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        ) : !loadingTeams && sprints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1 text-center">
            <p className="text-sm text-muted-foreground">No sprints found for this team.</p>
            <p className="text-xs text-muted-foreground">
              Create one on the{' '}
              <Link href="/dashboard/sprints" className="underline">Sprints</Link>{' '}
              page first.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {sprints.map((sprint) => {
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
                    href={`/dashboard/planning?sprint=${sprint.id}&team=${teamId}`}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Open Planning
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* New Planning Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Sprint Planning</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {unstarted.length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                No sprints in <strong>Planning</strong> status.{' '}
                <Link
                  href="/dashboard/sprints"
                  className="underline"
                  onClick={() => setDialogOpen(false)}
                >
                  Create a new sprint
                </Link>{' '}
                first, then come back to start planning.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Select a sprint to begin planning:
                </p>
                <Select value={pickId} onValueChange={setPickId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select sprint…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unstarted.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            {unstarted.length > 0 && (
              <Button
                size="sm"
                disabled={!pickId}
                onClick={() => {
                  router.push(`/dashboard/planning?sprint=${pickId}&team=${teamId}`)
                  setDialogOpen(false)
                }}
              >
                Open Planning
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
