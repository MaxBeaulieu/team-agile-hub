'use client'

import { useState, useTransition } from 'react'
import {
  CalendarRange, ChevronRight, MoreHorizontal,
  Users, Zap, CheckCircle2, Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Sprint, SprintStatus } from './page'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  userId: string
  displayName: string
  role: string
}

interface Props {
  sprint: Sprint
  sprintTerm: string
  teamId: string
  userId: string
  teamMembers: TeamMember[]
  onUpdate: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SprintStatus, { label: string; className: string; icon: React.ElementType }> = {
  planning: { label: 'Planning', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Clock },
  active:   { label: 'Active',   className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: Zap },
  completed:{ label: 'Completed',className: 'bg-muted text-muted-foreground border-transparent', icon: CheckCircle2 },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysRemaining(endDate: string): string {
  const end = new Date(endDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const diff = Math.round((end.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Ends today'
  return `${diff}d left`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SprintCard({ sprint, sprintTerm, teamId, teamMembers, onUpdate }: Props) {
  const cfg = STATUS_CONFIG[sprint.status]
  const StatusIcon = cfg.icon
  const [pending, startTransition] = useTransition()
  const [editGoalOpen, setEditGoalOpen] = useState(false)
  const [editedGoal, setEditedGoal] = useState(sprint.goal ?? '')
  const [editChampionOpen, setEditChampionOpen] = useState(false)
  const [selectedChampionId, setSelectedChampionId] = useState<string>(sprint.championId ?? 'none')

  const isActive = sprint.status === 'active'
  const isPlanning = sprint.status === 'planning'

  function activateSprint() {
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { status: 'Active' })
        toast.success(`${sprintTerm} activated`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to activate ${sprintTerm.toLowerCase()}`)
      }
    })
  }

  function completeSprint() {
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { status: 'Completed' })
        toast.success(`${sprintTerm} completed`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to complete ${sprintTerm.toLowerCase()}`)
      }
    })
  }

  function saveChampion(value: string) {
    const championId = value === 'none' ? null : value
    setSelectedChampionId(value)
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { championId })
        toast.success('Champion updated')
        setEditChampionOpen(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update champion')
      }
    })
  }

  function saveGoal(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/sprints/${sprint.id}`, { goal: editedGoal.trim() || null })
        toast.success('Goal updated')
        setEditGoalOpen(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update goal')
      }
    })
  }

  // Resolve champion display name
  const champion = sprint.championId
    ? teamMembers.find((m) => m.userId === sprint.championId)
    : null

  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold truncate">{sprint.name}</h2>
              <Badge
                variant="outline"
                className={`h-5 gap-1 px-1.5 text-[10px] font-medium border ${cfg.className}`}
              >
                <StatusIcon className="size-2.5" />
                {cfg.label}
              </Badge>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1 mt-1">
              <CalendarRange className="size-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
              </span>
              {isActive && (
                <span className="text-[10px] text-orange-400 font-medium ml-1">
                  {daysRemaining(sprint.endDate)}
                </span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={pending}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditGoalOpen(true)}>
                Edit goal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditChampionOpen(true)}>
                Change champion
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isPlanning && (
                <DropdownMenuItem onClick={activateSprint} disabled={pending}>
                  <Zap className="size-3.5 mr-2 text-green-500" />
                  Activate {sprintTerm.toLowerCase()}
                </DropdownMenuItem>
              )}
              {isActive && (
                <DropdownMenuItem onClick={completeSprint} disabled={pending}>
                  <CheckCircle2 className="size-3.5 mr-2 text-muted-foreground" />
                  Complete {sprintTerm.toLowerCase()}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Goal */}
        {editGoalOpen ? (
          <form onSubmit={saveGoal} className="flex gap-2">
            <input
              autoFocus
              value={editedGoal}
              onChange={(e) => setEditedGoal(e.target.value)}
              placeholder={`${sprintTerm} goal…`}
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-3" disabled={pending}>Save</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setEditGoalOpen(false)}>
              Cancel
            </Button>
          </form>
        ) : sprint.goal ? (
          <p
            className="text-xs text-muted-foreground leading-relaxed line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
            onClick={() => setEditGoalOpen(true)}
            title="Click to edit goal"
          >
            {sprint.goal}
          </p>
        ) : (
          <button
            className="text-xs text-muted-foreground/60 italic text-left hover:text-muted-foreground transition-colors"
            onClick={() => setEditGoalOpen(true)}
          >
            No goal set — click to add one
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {/* Member count */}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {sprint.sprint_members.length} / {teamMembers.length}
            </span>
            {/* Champion */}
            {editChampionOpen ? (
              <Select
                value={selectedChampionId}
                onValueChange={saveChampion}
                disabled={pending}
              >
                <SelectTrigger className="h-6 w-36 text-[11px] px-2 border-border">
                  <SelectValue placeholder="No champion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No champion</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId} className="text-xs">
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setEditChampionOpen(true)}
                title="Click to change champion"
              >
                {champion ? (
                  <><span>⚡</span><span className="truncate max-w-[100px]">{champion.displayName.split(' ')[0]}</span></>
                ) : (
                  <span className="italic text-muted-foreground/60">No champion</span>
                )}
              </button>
            )}
          </div>

          {/* Quick-link to planning page */}
          <a
            href={`/dashboard/planning?sprint=${sprint.id}&team=${teamId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Plan
            <ChevronRight className="size-3" />
          </a>

          {/* Quick-link to retro page */}
          <a
            href={`/dashboard/retro?sprintId=${sprint.id}&teamId=${teamId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Retro
            <ChevronRight className="size-3" />
          </a>

          {/* Quick-link to poker page */}
          <a
            href={`/dashboard/poker?sprintId=${sprint.id}&teamId=${teamId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Poker
            <ChevronRight className="size-3" />
          </a>

          {/* Quick-link to health dashboard */}
          <a
            href={`/dashboard/sprints/${sprint.id}/health?teamId=${teamId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Health
            <ChevronRight className="size-3" />
          </a>
        </div>
      </div>

      {/* Edit goal dialog (inline, no modal) — handled by inline form above */}
    </>
  )
}
