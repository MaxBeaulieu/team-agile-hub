'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'carried_over' | 'dropped'
type ActionItemType   = 'retro' | 'planning'

type ActionItem = {
  id: string
  sprintId: string
  type: ActionItemType
  assigneeId: string | null
  text: string
  dueDate: string | null
  status: ActionItemStatus
  carriedFromId: string | null
  createdAt: string
}

type Sprint = {
  id: string
  name: string
  status: string
  startDate: string
  endDate: string
}

type TeamMember = {
  id: string
  userId: string
  displayName: string
  role: string
}

type Team = {
  id: string
  name: string
  team_members: TeamMember[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ActionItemStatus, { label: string; className: string }> = {
  open:         { label: 'Open',        className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  in_progress:  { label: 'In Progress', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  done:         { label: 'Done',        className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  carried_over: { label: 'Carried',     className: 'bg-muted text-muted-foreground border-transparent' },
  dropped:      { label: 'Dropped',     className: 'bg-muted text-muted-foreground border-transparent' },
}

const ALL_STATUSES: ActionItemStatus[] = ['open', 'in_progress', 'done', 'carried_over', 'dropped']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(item: ActionItem): boolean {
  if (!item.dueDate) return false
  if (item.status === 'done' || item.status === 'carried_over' || item.status === 'dropped') return false
  return new Date(item.dueDate) < new Date()
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ActionItemRow({
  item,
  sprintName,
  assigneeName,
  onStatusChange,
}: {
  item: ActionItem
  sprintName: string
  assigneeName: string | null
  onStatusChange: (s: ActionItemStatus) => void
}) {
  const overdue              = isOverdue(item)
  const { label, className } = STATUS_CONFIG[item.status]
  const faded                = item.status === 'done' || item.status === 'dropped'

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 bg-card transition-colors ${
        overdue ? 'border-red-500/30' : 'border-border'
      }`}
    >
      {/* Clickable status badge */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="mt-0.5 shrink-0">
            <Badge
              variant="outline"
              className={`text-[11px] px-2 py-0.5 rounded-full cursor-pointer select-none whitespace-nowrap ${className}`}
            >
              {label}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ALL_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => onStatusChange(s)}
              className={item.status === s ? 'font-medium' : ''}
            >
              {STATUS_CONFIG[s].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Text */}
      <span
        className={`flex-1 text-sm leading-snug py-0.5 ${
          faded ? 'line-through text-muted-foreground' : ''
        }`}
      >
        {item.text}
      </span>

      {/* Meta chips */}
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[50%]">
        {/* Type */}
        <Badge
          variant="outline"
          className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${
            item.type === 'retro'
              ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
              : 'bg-sky-500/10 text-sky-500 border-sky-500/20'
          }`}
        >
          {item.type}
        </Badge>

        {/* Sprint */}
        <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full">
          {sprintName}
        </Badge>

        {/* Assignee */}
        {assigneeName && (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full">
            {assigneeName}
          </Badge>
        )}

        {/* Due date */}
        {item.dueDate && (
          <Badge
            variant="outline"
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              overdue ? 'border-red-500/30 text-red-500 bg-red-500/10' : ''
            }`}
          >
            {overdue && '⚠ '}
            {new Date(item.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </Badge>
        )}

        {/* Carry-over chain */}
        {item.carriedFromId && (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full text-muted-foreground">
            ↩ Carried
          </Badge>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActionItemsPage() {
  const [teams,          setTeams]          = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [sprints,        setSprints]        = useState<Sprint[]>([])
  const [items,          setItems]          = useState<ActionItem[]>([])
  const [filterSprint,   setFilterSprint]   = useState('__all__')
  const [filterStatus,   setFilterStatus]   = useState<ActionItemStatus | '__all__'>('__all__')
  const [filterType,     setFilterType]     = useState<ActionItemType | '__all__'>('__all__')
  const [loadingTeams,   setLoadingTeams]   = useState(true)
  const [loadingData,    setLoadingData]    = useState(false)

  // Load teams once
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // Load action items + sprints when team changes
  const loadData = useCallback(async (teamId: string) => {
    if (!teamId) return
    setLoadingData(true)
    try {
      const data = await api.get<{ items: ActionItem[]; sprints: Sprint[] }>(
        `/api/teams/${teamId}/action-items`,
      )
      setItems(data.items)
      setSprints(data.sprints)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load action items')
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeamId) {
      setFilterSprint('__all__')
      setFilterStatus('__all__')
      setFilterType('__all__')
      loadData(selectedTeamId)
    } else {
      setItems([])
      setSprints([])
    }
  }, [selectedTeamId, loadData])

  // Members from selected team object
  const members = teams.find((t) => t.id === selectedTeamId)?.team_members ?? []

  function getMemberName(userId: string | null): string | null {
    if (!userId) return null
    return members.find((m) => m.userId === userId)?.displayName ?? null
  }

  function getSprintName(sprintId: string): string {
    return sprints.find((s) => s.id === sprintId)?.name ?? sprintId.slice(0, 8)
  }

  // Optimistic status update
  function handleStatusChange(item: ActionItem, status: ActionItemStatus) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)))
    api.patch(`/api/teams/${selectedTeamId}/action-items/${item.id}`, { status })
      .catch((err) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)))
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      })
  }

  // Local filtering
  const filtered = items.filter((item) => {
    if (filterSprint !== '__all__' && item.sprintId !== filterSprint) return false
    if (filterStatus !== '__all__' && item.status   !== filterStatus) return false
    if (filterType   !== '__all__' && item.type     !== filterType)   return false
    return true
  })

  const openCount       = items.filter((i) => i.status === 'open' || i.status === 'in_progress').length
  const overdueCount    = items.filter(isOverdue).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="size-5 shrink-0" />
          <h1 className="text-lg font-semibold">Action Items</h1>
          {selectedTeamId && !loadingData && (
            <div className="flex items-center gap-1.5 ml-2">
              {openCount > 0 && (
                <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {openCount} open
                </Badge>
              )}
              {overdueCount > 0 && (
                <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border-red-500/20">
                  {overdueCount} overdue
                </Badge>
              )}
            </div>
          )}
        </div>

        {loadingTeams ? (
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
        ) : (
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select team…" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Filter bar */}
      {selectedTeamId && (
        <div className="flex items-center gap-2 border-b border-border px-6 py-2 shrink-0 flex-wrap">
          <Select value={filterSprint} onValueChange={setFilterSprint}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="All Sprints" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sprints</SelectItem>
              {sprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as ActionItemType | '__all__')}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              <SelectItem value="retro">Retro</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ActionItemStatus | '__all__')}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!selectedTeamId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a team to view action items.
          </div>
        ) : loadingData ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No action items found.
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                sprintName={getSprintName(item.sprintId)}
                assigneeName={getMemberName(item.assigneeId)}
                onStatusChange={(s) => handleStatusChange(item, s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
