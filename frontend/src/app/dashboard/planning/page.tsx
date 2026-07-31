'use client'

import { Suspense, useCallback, useEffect, useState, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarRange, ChevronRight, Zap, CheckCircle2, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { CapacitySection } from './capacity-section'
import { FocusTopicsSection } from './focus-topics-section'
import { AgendaSection } from './agenda-section'
import { ActionItemsSection } from './action-items-section'

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type SprintStatus = 'planning' | 'active' | 'completed'
export type FocusTopicStatus = 'on_track' | 'at_risk' | 'on_hold' | 'done'
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'carried_over' | 'dropped'

export type SprintMemberData = {
  id: string
  sprintId: string
  userId: string
  daysOff: string | null
  capacityScore: number | null
}

export type SprintTrainingData = {
  id: string
  sprintId: string
  userId: string
  description: string
}

export type FocusTopicData = {
  id: string
  sprintId: string
  title: string
  content: string | null
  status: FocusTopicStatus
  order: number
  talking_points: TalkingPointData[]
}

export type TalkingPointNoteData = {
  id: string
  talkingPointId: string
  authorId: string
  content: string
  createdAt: string
}

export type TalkingPointData = {
  id: string
  focusTopicId: string | null
  agendaItemId: string | null
  text: string
  order: number
  createdAt: string
  talking_point_notes: TalkingPointNoteData[]
  action_items: ActionItemData[]
}

export type ActionItemData = {
  id: string
  sprintId: string
  type: 'retro' | 'planning'
  assigneeId: string | null
  text: string
  dueDate: string | null
  status: ActionItemStatus
  carriedFromId: string | null
  createdAt: string
}

export type TeamMemberData = {
  id: string
  teamId: string
  userId: string
  displayName: string
  role: string
  joinedAt: string
}

export type RecurringAgendaItemData = {
  id: string
  teamId: string
  title: string
  lastStatus: string | null
  snoozedUntilSprintNumber: number | null
  talking_points: TalkingPointData[]
}

export type SprintDetail = {
  id: string
  teamId: string
  name: string
  goal: string | null
  previousGoal: string | null
  championId: string | null
  startDate: string
  endDate: string
  status: SprintStatus
  createdAt: string
  sprint_members: SprintMemberData[]
  sprint_trainings: SprintTrainingData[]
  focus_topics: FocusTopicData[]
  action_items: ActionItemData[]
}

export type PlanningData = {
  sprint: SprintDetail
  teamMembers: TeamMemberData[]
  recurringAgenda: RecurringAgendaItemData[]
  carryOverItems: ActionItemData[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SprintStatus, { label: string; className: string; icon: React.ElementType }> = {
  planning:  { label: 'Planning',  className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',  icon: Clock },
  active:    { label: 'Active',    className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: Zap },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-transparent',  icon: CheckCircle2 },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Sprint Header ────────────────────────────────────────────────────────────

function SprintHeader({
  sprint, teamId, champion, onUpdate,
}: {
  sprint: SprintDetail
  teamId: string
  champion: TeamMemberData | undefined
  onUpdate: () => void
}) {
  const cfg = STATUS_CONFIG[sprint.status]
  const StatusIcon = cfg.icon
  const [editingName, setEditingName] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [name, setName] = useState(sprint.name)
  const [goal, setGoal] = useState(sprint.goal ?? '')
  const [pending, startTransition] = useTransition()

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { name: name.trim() })
        toast.success('Sprint renamed')
        setEditingName(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to rename')
      }
    })
  }

  function saveGoal(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { goal: goal.trim() || null })
        toast.success('Goal updated')
        setEditingGoal(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update goal')
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Name + status */}
      <div className="flex items-center gap-3 flex-wrap">
        {editingName ? (
          <form onSubmit={saveName} className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-lg font-bold outline-none focus:ring-1 focus:ring-primary w-60"
              disabled={pending}
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-3" disabled={pending || !name.trim()}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2"
              onClick={() => { setName(sprint.name); setEditingName(false) }}>
              Cancel
            </Button>
          </form>
        ) : (
          <h1
            className="text-lg font-bold cursor-pointer hover:text-primary transition-colors"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {sprint.name}
          </h1>
        )}
        <Badge variant="outline" className={`h-5 gap-1 px-1.5 text-[10px] font-medium border ${cfg.className}`}>
          <StatusIcon className="size-2.5" />
          {cfg.label}
        </Badge>
      </div>

      {/* Dates + champion */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <CalendarRange className="size-3" />
          {fmt(sprint.startDate)} – {fmt(sprint.endDate)}
        </span>
        {champion && (
          <span className="flex items-center gap-1">
            ⚡ {champion.displayName}
          </span>
        )}
      </div>

      {/* Goal */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sprint Goal</p>
        {editingGoal ? (
          <form onSubmit={saveGoal} className="flex items-start gap-2">
            <textarea
              autoFocus
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What does success look like for this sprint?"
              rows={2}
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
              disabled={pending}
            />
            <div className="flex flex-col gap-1">
              <Button type="submit" size="sm" className="h-7 text-xs px-3" disabled={pending}>Save</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2"
                onClick={() => { setGoal(sprint.goal ?? ''); setEditingGoal(false) }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : sprint.goal ? (
          <p className="text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            onClick={() => setEditingGoal(true)} title="Click to edit goal">
            {sprint.goal}
          </p>
        ) : (
          <button className="text-sm italic text-muted-foreground/60 hover:text-muted-foreground transition-colors text-left"
            onClick={() => setEditingGoal(true)}>
            No goal set — click to add one
          </button>
        )}
      </div>

      {/* Previous goal reference */}
      {sprint.previousGoal && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
            Previous sprint goal
          </p>
          <p className="text-xs text-muted-foreground">{sprint.previousGoal}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PlanningPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sprintId = searchParams.get('sprint')
  const teamId   = searchParams.get('team')

  const [data, setData] = useState<PlanningData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!sprintId || !teamId) return
    setLoading(true)
    try {
      const d = await api.get<PlanningData>(`/api/teams/${teamId}/sprints/${sprintId}/planning`)
      setData(d)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load planning data')
    } finally {
      setLoading(false)
    }
  }, [sprintId, teamId])

  // Silent background refresh — no spinner, used for all mutation callbacks
  const refresh = useCallback(async () => {
    if (!sprintId || !teamId) return
    try {
      const d = await api.get<PlanningData>(`/api/teams/${teamId}/sprints/${sprintId}/planning`)
      setData(d)
    } catch {
      // silently ignore
    }
  }, [sprintId, teamId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!sprintId || !teamId) router.replace('/dashboard/planning/list')
  }, [sprintId, teamId, router])

  if (!sprintId || !teamId) return null

  const champion = data?.teamMembers.find((m) => m.userId === data.sprint.championId)

  return (
    <>
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <Link href="/dashboard/sprints"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="size-3.5" />
          Sprints
        </Link>
        <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
        <span className="text-sm font-medium truncate">{data?.sprint.name ?? '…'}</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Loading planning data…</p>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-xs text-muted-foreground">Sprint not found.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
            {/* Sprint header */}
            <SprintHeader
              sprint={data.sprint}
              teamId={teamId}
              champion={champion}
              onUpdate={refresh}
            />

            {/* Capacity & training */}
            <CapacitySection
              sprint={data.sprint}
              teamId={teamId}
              teamMembers={data.teamMembers}
              onUpdate={refresh}
            />

            {/* Focus topics */}
            <FocusTopicsSection
              sprint={data.sprint}
              teamId={teamId}
              teamMembers={data.teamMembers}
              onUpdate={refresh}
            />

            {/* Recurring agenda */}
            <AgendaSection
              items={data.recurringAgenda}
              teamId={teamId}
              sprint={data.sprint}
              teamMembers={data.teamMembers}
              onUpdate={refresh}
            />

            {/* Action items */}
            <ActionItemsSection
              sprint={data.sprint}
              teamId={teamId}
              teamMembers={data.teamMembers}
              carryOverItems={data.carryOverItems}
              onUpdate={refresh}
            />
          </div>
        )}
      </main>
    </>
  )
}

export default function PlanningPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center flex-1 min-h-[400px]">
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    }>
      <PlanningPageContent />
    </Suspense>
  )
}
