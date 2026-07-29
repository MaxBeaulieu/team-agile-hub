'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, AlertTriangle, ArrowLeft, BarChart2,
  CheckCircle2, Loader2, Smile, Spade, Users, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type SprintStatus = 'planning' | 'active' | 'completed'

type HealthData = {
  sprint: {
    id: string
    name: string
    startDate: string
    endDate: string
    status: SprintStatus
    goal: string | null
  }
  members: { userId: string; displayName: string; role: string }[]
  capacity: {
    userId: string
    displayName: string
    daysOff: number
    capacityScore: number | null
  }[]
  mood: {
    avgEntry: number | null
    avgExit: number | null
    totalCheckins: number
  }
  actionItems: {
    total: number
    open: number
    inProgress: number
    done: number
    carriedOver: number
    dropped: number
  }
  blockers: {
    total: number
    open: number
    inProgress: number
    resolved: number
  }
  velocity: {
    hasSession: boolean
    totalPoints: number
    ticketCount: number
    estimatedCount: number
  }
  teamVelocity: {
    sprintId: string
    sprintName: string
    sprintStatus: SprintStatus
    totalPoints: number
    ticketCount: number
    hasSession: boolean
  }[]
  pokerConsensus: {
    avgSpread: number | null
    tickets: {
      ticketId: string
      title: string
      finalPoints: number | null
      estimates: string[]
      voteCount: number
      spread: number | null
    }[]
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SPRINT_STATUS_CLASS: Record<SprintStatus, string> = {
  active:    'bg-green-500/10 text-green-500 border-green-500/20',
  planning:  'bg-blue-500/10 text-blue-500 border-blue-500/20',
  completed: 'bg-muted text-muted-foreground border-transparent',
}

const MOOD_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😶', 4: '😊', 5: '😄' }

// ─── Shared Widget Shell ──────────────────────────────────────────────────────

function WidgetCard({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 min-h-[180px]">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function NoData({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic">{text}</p>
}

// ─── Capacity Widget ──────────────────────────────────────────────────────────

function getCapacityColor(score: number | null) {
  if (!score) return 'bg-muted-foreground/30'
  if (score >= 8) return 'bg-green-500'
  if (score >= 5) return 'bg-amber-500'
  return 'bg-red-500'
}

function CapacityWidget({ data }: { data: HealthData }) {
  const { capacity } = data
  return (
    <WidgetCard title="Team Capacity" icon={<Users className="size-3.5" />}>
      {capacity.length === 0 ? (
        <NoData text="No capacity data — add capacity scores in Sprint Planning." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {capacity.map((m) => (
            <div key={m.userId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate max-w-[140px]">{m.displayName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {m.daysOff > 0 && (
                    <span className="text-[11px] text-muted-foreground">{m.daysOff}d off</span>
                  )}
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {m.capacityScore !== null ? `${m.capacityScore}/10` : '—'}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getCapacityColor(m.capacityScore)}`}
                  style={{ width: `${(m.capacityScore ?? 0) * 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Action Items Widget ──────────────────────────────────────────────────────

const AI_SEGMENTS = [
  { key: 'done',        label: 'Done',         color: 'bg-green-500'          },
  { key: 'inProgress',  label: 'In Progress',  color: 'bg-blue-500'           },
  { key: 'open',        label: 'Open',         color: 'bg-amber-500'          },
  { key: 'carriedOver', label: 'Carried Over', color: 'bg-purple-400'         },
  { key: 'dropped',     label: 'Dropped',      color: 'bg-muted-foreground/40'},
] as const

function ActionItemsWidget({ data }: { data: HealthData }) {
  const ai = data.actionItems
  const completionPct = ai.total > 0 ? Math.round((ai.done / ai.total) * 100) : 0
  return (
    <WidgetCard title="Action Items" icon={<CheckCircle2 className="size-3.5" />}>
      {ai.total === 0 ? (
        <NoData text="No action items for this sprint." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-xl font-bold tabular-nums">
            {ai.done}<span className="text-sm font-normal text-muted-foreground"> / {ai.total} done</span>
            <span className="ml-2 text-sm font-semibold text-muted-foreground">({completionPct}%)</span>
          </div>
          {/* Stacked bar */}
          <div className="flex h-2.5 w-full rounded-full overflow-hidden gap-px">
            {AI_SEGMENTS.map((s) => {
              const count = ai[s.key as keyof typeof ai] as number
              return count > 0 ? (
                <div
                  key={s.key}
                  className={s.color}
                  style={{ flex: count }}
                  title={`${s.label}: ${count}`}
                />
              ) : null
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {AI_SEGMENTS.map((s) => {
              const count = ai[s.key as keyof typeof ai] as number
              return count > 0 ? (
                <div key={s.key} className="flex items-center gap-1">
                  <div className={`size-2 rounded-full shrink-0 ${s.color}`} />
                  <span className="text-[11px] text-muted-foreground">
                    {s.label} <span className="font-medium text-foreground">{count}</span>
                  </span>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Blockers Widget ──────────────────────────────────────────────────────────

function BlockersWidget({ data }: { data: HealthData }) {
  const { blockers } = data
  return (
    <WidgetCard title="Blockers" icon={<AlertTriangle className="size-3.5" />}>
      {blockers.total === 0 ? (
        <div className="flex items-center gap-2 text-green-500 text-xs font-medium">
          <CheckCircle2 className="size-4 shrink-0" />
          No blockers — all clear!
        </div>
      ) : (
        <div className="flex gap-6">
          <StatCol value={blockers.open}       label="Open"        className="text-red-500"   />
          <div className="w-px bg-border" />
          <StatCol value={blockers.inProgress} label="In Progress" className="text-amber-500" />
          <div className="w-px bg-border" />
          <StatCol value={blockers.resolved}   label="Resolved"    className="text-green-500" />
        </div>
      )}
    </WidgetCard>
  )
}

function StatCol({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-2xl font-bold tabular-nums ${className}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

// ─── Mood Widget ──────────────────────────────────────────────────────────────

function MoodWidget({ data }: { data: HealthData }) {
  const { mood } = data
  const hasData = mood.avgEntry !== null || mood.avgExit !== null

  function MoodAvg({ label, value }: { label: string; value: number | null }) {
    if (value === null) return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-3xl">—</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    )
    const emojiIdx = Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl">{MOOD_EMOJI[emojiIdx]}</span>
          <span className="text-sm font-bold">{value.toFixed(1)}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    )
  }

  return (
    <WidgetCard title="Team Mood" icon={<Smile className="size-3.5" />}>
      {!hasData ? (
        <NoData text="No mood check-ins for this sprint yet." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-5">
            <MoodAvg label="Entry" value={mood.avgEntry} />
            {mood.avgEntry !== null && mood.avgExit !== null && (
              <div className="flex flex-col items-center gap-0.5">
                {(() => {
                  const delta = Math.round((mood.avgExit - mood.avgEntry) * 10) / 10
                  const color = delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'
                  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
                  return (
                    <>
                      <span className={`text-lg font-bold ${color}`}>{arrow}</span>
                      <span className={`text-xs font-medium ${color}`}>{Math.abs(delta).toFixed(1)}</span>
                    </>
                  )
                })()}
              </div>
            )}
            <MoodAvg label="Exit" value={mood.avgExit} />
          </div>
          <p className="text-xs text-muted-foreground">
            Based on {mood.totalCheckins} check-in{mood.totalCheckins !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Velocity Widget ──────────────────────────────────────────────────────────

function VelocityWidget({ data }: { data: HealthData }) {
  const { velocity, teamVelocity, sprint } = data
  const maxPts  = Math.max(...teamVelocity.map((s) => s.totalPoints), 1)

  return (
    <WidgetCard title="Velocity" icon={<Zap className="size-3.5" />}>
      {/* Current sprint big number */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl font-bold tabular-nums">{velocity.totalPoints}</span>
        <span className="text-sm text-muted-foreground">pts</span>
        {velocity.ticketCount > 0 && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {velocity.estimatedCount}/{velocity.ticketCount} tickets estimated
          </span>
        )}
      </div>

      {/* Bar chart (oldest → newest) */}
      {teamVelocity.length > 0 && (
        <>
          <p className="text-[11px] text-muted-foreground mb-1.5">
            Last {teamVelocity.length} sprint{teamVelocity.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-end gap-1 h-16">
            {teamVelocity.map((s) => {
              const heightPct  = maxPts > 0 ? (s.totalPoints / maxPts) * 100 : 0
              const isCurrent  = s.sprintId === sprint.id
              const barClass   = isCurrent ? 'bg-primary' : s.hasSession ? 'bg-primary/40' : 'bg-muted'
              const shortLabel = s.sprintName.replace(/sprint\s*/i, '').slice(0, 5)
              return (
                <div
                  key={s.sprintId}
                  className="flex flex-1 flex-col items-center gap-0.5"
                  title={`${s.sprintName}: ${s.totalPoints} pts`}
                >
                  <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
                    <div
                      className={`w-full rounded-t transition-all ${barClass}`}
                      style={{ height: `${Math.max(heightPct, 5)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-none">
                    {shortLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!velocity.hasSession && (
        <p className="text-xs text-muted-foreground mt-2">No planning poker session for this sprint.</p>
      )}
    </WidgetCard>
  )
}

// ─── Poker Consensus Widget ───────────────────────────────────────────────────

function ConsensusWidget({ data }: { data: HealthData }) {
  const { pokerConsensus, velocity } = data

  return (
    <WidgetCard title="Poker Consensus" icon={<Spade className="size-3.5" />}>
      {!velocity.hasSession ? (
        <NoData text="No planning poker session for this sprint." />
      ) : pokerConsensus.tickets.length === 0 ? (
        <NoData text="No tickets estimated yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {pokerConsensus.avgSpread !== null && (
            <p className="text-xs text-muted-foreground">
              Avg spread:{' '}
              <span
                className={`font-semibold ${
                  pokerConsensus.avgSpread === 0
                    ? 'text-green-500'
                    : pokerConsensus.avgSpread <= 3
                    ? 'text-amber-500'
                    : 'text-red-500'
                }`}
              >
                {pokerConsensus.avgSpread}
              </span>
              {pokerConsensus.avgSpread === 0
                ? ' — perfect consensus'
                : pokerConsensus.avgSpread <= 3
                ? ' — good alignment'
                : ' — high variance'}
            </p>
          )}
          <div className="flex flex-col divide-y divide-border max-h-40 overflow-y-auto">
            {pokerConsensus.tickets.map((t) => (
              <div key={t.ticketId} className="flex items-center gap-2 py-1.5 min-w-0">
                <span className="flex-1 text-xs truncate" title={t.title}>
                  {t.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.spread === null ? (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  ) : t.spread === 0 ? (
                    <span className="text-[11px] text-green-500 font-medium">✓</span>
                  ) : (
                    <span className="text-[11px] text-amber-500 font-medium">±{t.spread}</span>
                  )}
                  <span
                    className={`text-xs font-bold tabular-nums w-5 text-right ${
                      t.finalPoints !== null ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {t.finalPoints ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Page Inner ───────────────────────────────────────────────────────────────

function HealthPageInner() {
  const { id: sprintId }  = useParams() as { id: string }
  const searchParams       = useSearchParams()
  const teamId             = searchParams.get('teamId') ?? ''

  const [data,    setData]    = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!sprintId || !teamId) return
    try {
      const d = await api.get<HealthData>(`/api/teams/${teamId}/sprints/${sprintId}/health`)
      setData(d)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }, [sprintId, teamId])

  useEffect(() => { load() }, [load])

  if (!teamId || !sprintId) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Missing team or sprint information.</p>
        <Link href="/dashboard/sprints">
          <Button variant="outline" size="sm">Back to Sprints</Button>
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Health data not available.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link href="/dashboard/sprints">
          <Button variant="ghost" size="icon" className="size-7">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <Activity className="size-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight truncate">{data.sprint.name}</h1>
          <p className="text-[11px] text-muted-foreground">Sprint Health Dashboard</p>
        </div>
        <Badge variant="outline" className={SPRINT_STATUS_CLASS[data.sprint.status]}>
          {data.sprint.status.charAt(0).toUpperCase() + data.sprint.status.slice(1)}
        </Badge>
        <BarChart2 className="size-4 text-muted-foreground" />
      </header>

      {/* Widgets grid */}
      <main className="flex-1 overflow-y-auto p-6">
        {data.sprint.goal && (
          <p className="text-xs text-muted-foreground mb-4 px-1">
            <span className="font-medium text-foreground">Goal:</span> {data.sprint.goal}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <CapacityWidget     data={data} />
          <ActionItemsWidget  data={data} />
          <BlockersWidget     data={data} />
          <MoodWidget         data={data} />
          <VelocityWidget     data={data} />
          <ConsensusWidget    data={data} />
        </div>
      </main>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HealthPageInner />
    </Suspense>
  )
}
