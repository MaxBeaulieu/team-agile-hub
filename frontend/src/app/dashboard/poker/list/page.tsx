'use client'

import { useCallback, useEffect, useState } from 'react'
import { Spade, ArrowRight, Clock, Zap, CheckCircle2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

type PokerSession = { id: string; sprintId: string }

type Team = { id: string; name: string }

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SprintStatus, { label: string; className: string; Icon: React.ElementType }> = {
  planning:  { label: 'Planning',  className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',   Icon: Clock },
  active:    { label: 'Active',    className: 'bg-green-500/10 text-green-500 border-green-500/20', Icon: Zap },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-transparent',  Icon: CheckCircle2 },
}

const POKER_ELIGIBLE: SprintStatus[] = ['planning', 'active', 'completed']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PokerListPage() {
  const [teams, setTeams]               = useState<Team[]>([])
  const [teamId, setTeamId]             = useState('')
  const [sprints, setSprints]           = useState<Sprint[]>([])
  const [sessions, setSessions]         = useState<PokerSession[]>([])
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingSprints, setLoadingSprints] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; sprintName: string } | null>(null)
  const [deleting, setDeleting]         = useState(false)

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
      const [sprintData, sessionData] = await Promise.all([
        api.get<Sprint[]>(`/api/teams/${teamId}/sprints`),
        api.get<{ sessions: PokerSession[] }>(`/api/teams/${teamId}/poker-sessions`)
          .then(d => d.sessions)
          .catch(() => [] as PokerSession[]),
      ])
      setSprints([...sprintData].sort((a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      ))
      setSessions(sessionData)
    } catch {
      toast.error('Failed to load sprints')
    } finally {
      setLoadingSprints(false)
    }
  }, [teamId])

  useEffect(() => { loadSprints() }, [loadSprints])

  async function confirmDelete() {
    if (!deleteTarget || !teamId) return
    setDeleting(true)
    try {
      await api.delete(`/api/teams/${teamId}/poker/${deleteTarget.sessionId}`)
      toast.success('Poker session deleted')
      setDeleteTarget(null)
      loadSprints()
    } catch {
      toast.error('Failed to delete session')
    } finally {
      setDeleting(false)
    }
  }

  // Planning/active sprints always show; completed only if they have an existing session
  const eligible = sprints.filter(s =>
    s.status !== 'completed' || sessions.some(sess => sess.sprintId === s.id)
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Spade className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Planning Poker</h1>
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
            <p className="text-sm text-muted-foreground">No sprints found.</p>
            <p className="text-xs text-muted-foreground">
              <Link href="/dashboard/sprints" className="underline">Create a sprint</Link>
              {' '}to start a poker session.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {eligible.map((sprint) => {
              const { label, className, Icon } = STATUS_CONFIG[sprint.status]
              const session = sessions.find(s => s.sprintId === sprint.id)
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
                      {session && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                          <Spade className="size-2.5" /> Session exists
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
                    </p>
                    {sprint.goal && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{sprint.goal}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {session && (
                      <button
                        onClick={() => setDeleteTarget({ sessionId: session.id, sprintName: sprint.name })}
                        className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                        title="Delete poker session"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    <Link
                      href={`/dashboard/poker?sprintId=${sprint.id}&teamId=${teamId}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {session ? 'Open' : 'Open Poker'}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete poker session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the poker session for{' '}
            <strong>{deleteTarget?.sprintName}</strong>, including all tickets and votes.
            This cannot be undone.
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
