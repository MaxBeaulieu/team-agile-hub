'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string }

type EpicStatus = 'on_track' | 'at_risk' | 'on_hold' | 'done'

type EpicKpiData = {
  id: string
  epicId: string
  label: string
  targetValue: string | null
  currentValue: string | null
  isDone: boolean
  order: number
}

type EpicData = {
  id: string
  teamId: string
  title: string
  description: string | null
  status: EpicStatus
  expectedDelivery: string | null
  jiraIssueId: string | null
  createdAt: string
  kpis: EpicKpiData[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EpicStatus, { label: string; className: string }> = {
  on_track: { label: 'On Track', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  at_risk:  { label: 'At Risk',  className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  on_hold:  { label: 'On Hold',  className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  done:     { label: 'Done',     className: 'bg-muted text-muted-foreground border-transparent' },
}

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as EpicStatus[]

// ─── KPI Row ──────────────────────────────────────────────────────────────────

function KpiRow({ kpi, teamId, onUpdate }: {
  kpi: EpicKpiData
  teamId: string
  onUpdate: () => void
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [label, setLabel] = useState(kpi.label)
  const [current, setCurrent] = useState(kpi.currentValue ?? '')
  const [target, setTarget] = useState(kpi.targetValue ?? '')
  const [pending, startTransition] = useTransition()

  function toggleDone() {
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/kpis/${kpi.id}`, { isDone: !kpi.isDone })
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update')
      }
    })
  }

  function saveInline() {
    if (!label.trim()) return
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/kpis/${kpi.id}`, {
          label:        label.trim(),
          currentValue: current.trim() || null,
          targetValue:  target.trim() || null,
        })
        setEditingLabel(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update KPI')
      }
    })
  }

  function deleteKpi() {
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/kpis/${kpi.id}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  return (
    <div className="flex items-center gap-2 py-1 group">
      {/* Done checkbox */}
      <button
        onClick={toggleDone}
        disabled={pending}
        className={`shrink-0 size-3.5 rounded border transition-colors ${kpi.isDone ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}
        title={kpi.isDone ? 'Mark incomplete' : 'Mark done'}
      >
        {kpi.isDone && <svg viewBox="0 0 10 10" className="fill-primary-foreground w-full h-full p-0.5"><path d="M1.5 5l3 3 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
      </button>

      {editingLabel ? (
        <div className="flex-1 flex flex-wrap gap-1 items-center">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
            className="flex-1 min-w-[120px] rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current"
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">/</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target"
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="button" size="sm" className="h-6 text-[10px] px-2" onClick={saveInline} disabled={pending || !label.trim()}>Save</Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-1"
            onClick={() => { setLabel(kpi.label); setCurrent(kpi.currentValue ?? ''); setTarget(kpi.targetValue ?? ''); setEditingLabel(false) }}>✕</Button>
        </div>
      ) : (
        <div
          className={`flex-1 flex items-center gap-2 cursor-pointer`}
          onClick={() => setEditingLabel(true)}
          title="Click to edit"
        >
          <span className={`text-xs leading-none ${kpi.isDone ? 'line-through text-muted-foreground' : ''}`}>
            {kpi.label}
          </span>
          {(kpi.currentValue || kpi.targetValue) && (
            <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded-full">
              {kpi.currentValue ?? '?'} / {kpi.targetValue ?? '?'}
            </span>
          )}
        </div>
      )}

      {!editingLabel && (
        <button
          onClick={deleteKpi}
          disabled={pending}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  )
}

// ─── Epic Card ────────────────────────────────────────────────────────────────

function EpicCard({ epic, teamId, onOptimisticUpdate, onUpdate }: {
  epic: EpicData
  teamId: string
  onOptimisticUpdate: (id: string, patch: Partial<EpicData>) => void
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(epic.title)
  const [desc, setDesc] = useState(epic.description ?? '')
  const [addingKpi, setAddingKpi] = useState(false)
  const [kpiLabel, setKpiLabel] = useState('')
  const [kpiCurrent, setKpiCurrent] = useState('')
  const [kpiTarget, setKpiTarget] = useState('')
  const [pending, startTransition] = useTransition()

  const cfg = STATUS_CONFIG[epic.status]
  const kpis = [...(epic.kpis ?? [])].sort((a, b) => a.order - b.order)

  function setStatus(newStatus: EpicStatus) {
    onOptimisticUpdate(epic.id, { status: newStatus })
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/epics/${epic.id}`, { status: newStatus })
        onUpdate()
      } catch (err) {
        onOptimisticUpdate(epic.id, { status: epic.status }) // revert
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      }
    })
  }

  function saveTitle(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/epics/${epic.id}`, {
          title:       title.trim(),
          description: desc.trim() || null,
        })
        setEditingTitle(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update epic')
      }
    })
  }

  function deleteEpic() {
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/epics/${epic.id}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete epic')
      }
    })
  }

  function addKpi(e: React.FormEvent) {
    e.preventDefault()
    if (!kpiLabel.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/epics/${epic.id}/kpis`, {
          label:        kpiLabel.trim(),
          currentValue: kpiCurrent.trim() || null,
          targetValue:  kpiTarget.trim() || null,
        })
        setKpiLabel('')
        setKpiCurrent('')
        setKpiTarget('')
        setAddingKpi(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add KPI')
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded
            ? <ChevronDown className="size-4" />
            : <ChevronRight className="size-4" />}
        </button>

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <form onSubmit={saveTitle} className="space-y-2">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
                disabled={pending}
              />
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)…"
                rows={2}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
                disabled={pending}
              />
              <div className="flex gap-1">
                <Button type="submit" size="sm" className="h-7 text-xs px-3" disabled={pending || !title.trim()}>Save</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2"
                  onClick={() => { setTitle(epic.title); setDesc(epic.description ?? ''); setEditingTitle(false) }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <p
                className={`text-sm font-medium leading-snug cursor-pointer hover:text-primary transition-colors ${epic.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {epic.title}
              </p>
              {epic.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{epic.description}</p>
              )}
            </>
          )}

          {/* Meta row */}
          {!editingTitle && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={pending}>
                  <button title="Change status">
                    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-medium border cursor-pointer hover:opacity-80 transition-opacity ${cfg.className}`}>
                      {cfg.label}
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32">
                  {ALL_STATUSES.map((s) => {
                    const c = STATUS_CONFIG[s]
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => setStatus(s)}
                        className="gap-2 text-xs"
                      >
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${c.className}`}>
                          {c.label}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              {epic.expectedDelivery && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {new Date(epic.expectedDelivery).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
              {epic.jiraIssueId && (
                <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded-full">
                  {epic.jiraIssueId}
                </span>
              )}
              {kpis.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {kpis.filter((k) => k.isDone).length}/{kpis.length} criteria
                </span>
              )}
            </div>
          )}
        </div>

        {!editingTitle && (
          <button
            onClick={deleteEpic}
            disabled={pending}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            title="Delete epic"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Expanded: success criteria */}
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Success Criteria
          </p>

          {kpis.length === 0 && !addingKpi && (
            <p className="text-xs text-muted-foreground italic">No success criteria yet.</p>
          )}

          {kpis.map((k) => (
            <KpiRow key={k.id} kpi={k} teamId={teamId} onUpdate={onUpdate} />
          ))}

          {addingKpi ? (
            <form onSubmit={addKpi} className="flex flex-wrap gap-1 mt-2">
              <input
                autoFocus
                value={kpiLabel}
                onChange={(e) => setKpiLabel(e.target.value)}
                placeholder="Criterion label…"
                className="flex-1 min-w-[140px] rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                value={kpiCurrent}
                onChange={(e) => setKpiCurrent(e.target.value)}
                placeholder="Current"
                className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="self-center text-xs text-muted-foreground">/</span>
              <input
                value={kpiTarget}
                onChange={(e) => setKpiTarget(e.target.value)}
                placeholder="Target"
                className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <Button type="submit" size="sm" className="h-6 text-[10px] px-2" disabled={pending || !kpiLabel.trim()}>Add</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-1"
                onClick={() => { setKpiLabel(''); setKpiCurrent(''); setKpiTarget(''); setAddingKpi(false) }}>✕</Button>
            </form>
          ) : (
            <button
              onClick={() => setAddingKpi(true)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Plus className="size-3" /> Add criterion
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Epic Form ────────────────────────────────────────────────────────────

function AddEpicForm({ teamId, onAdded }: { teamId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [delivery, setDelivery] = useState('')
  const [jira, setJira] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/epics`, {
          title:            title.trim(),
          description:      desc.trim() || null,
          expectedDelivery: delivery || null,
          jiraIssueId:      jira.trim() || null,
        })
        setTitle(''); setDesc(''); setDelivery(''); setJira('')
        setOpen(false)
        onAdded()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create epic')
      }
    })
  }

  function close() {
    setTitle(''); setDesc(''); setDelivery(''); setJira('')
    setOpen(false)
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New Epic
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Epic</DialogTitle>
          </DialogHeader>

          <form id="add-epic-form" onSubmit={submit} className="space-y-4 pt-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Epic title…"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              disabled={pending}
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)…"
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
              disabled={pending}
            />
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Expected Delivery</label>
                <input
                  type="date"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                  disabled={pending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Jira ID</label>
                <input
                  value={jira}
                  onChange={(e) => setJira(e.target.value)}
                  placeholder="e.g. PROJ-123"
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary w-32"
                  disabled={pending}
                />
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>Cancel</Button>
            <Button type="submit" form="add-epic-form" size="sm" disabled={pending || !title.trim()}>Create Epic</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Page Content ─────────────────────────────────────────────────────────────

export default function EpicsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState<string>('')
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [epics, setEpics] = useState<EpicData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // Initial load — shows spinner
  const load = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    try {
      const data = await api.get<EpicData[]>(`/api/teams/${teamId}/epics`)
      setEpics(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load epics')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  // Silent background refresh — no spinner
  const refresh = useCallback(async () => {
    if (!teamId) return
    try {
      const data = await api.get<EpicData[]>(`/api/teams/${teamId}/epics`)
      setEpics(data)
    } catch {
      // silently ignore, optimistic update already applied
    }
  }, [teamId])

  const optimisticUpdate = useCallback((id: string, patch: Partial<EpicData>) => {
    setEpics((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))
  }, [])

  useEffect(() => {
    if (teamId) load()
    else setEpics([])
  }, [teamId, load])

  const active = epics.filter((e) => e.status !== 'done')
  const done   = epics.filter((e) => e.status === 'done')

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-sm font-semibold">Epics</h1>
        <div className="flex items-center gap-2">
          {!loadingTeams && (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Select a team…" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {teamId && <AddEpicForm teamId={teamId} onAdded={refresh} />}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loadingTeams ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Loading teams…</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Create a team first.</p>
          </div>
        ) : !teamId ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Select a team to view epics.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Loading epics…</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
            {/* Active epics */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Active
              </h2>
              {active.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active epics. Create one above.</p>
              ) : (
                <div className="space-y-3">
                  {active.map((e) => (
                    <div key={e.id} className="group">
                      <EpicCard epic={e} teamId={teamId} onOptimisticUpdate={optimisticUpdate} onUpdate={refresh} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Done epics */}
            {done.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Done
                </h2>
                <div className="space-y-3">
                  {done.map((e) => (
                    <div key={e.id} className="group">
                      <EpicCard epic={e} teamId={teamId} onOptimisticUpdate={optimisticUpdate} onUpdate={refresh} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
