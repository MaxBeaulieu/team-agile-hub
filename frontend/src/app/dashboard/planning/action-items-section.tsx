'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ArrowDownToLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { ActionItemData, ActionItemStatus, SprintDetail, TeamMemberData } from './page'

interface Props {
  sprint: SprintDetail
  teamId: string
  teamMembers: TeamMemberData[]
  carryOverItems: ActionItemData[]
  onUpdate: () => void
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ActionItemStatus, { label: string; className: string }> = {
  open:         { label: 'Open',        className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  in_progress:  { label: 'In Progress', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  done:         { label: 'Done',        className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  carried_over: { label: 'Carried',     className: 'bg-muted text-muted-foreground border-transparent' },
  dropped:      { label: 'Dropped',     className: 'bg-muted text-muted-foreground border-transparent' },
}

const ALL_STATUSES: ActionItemStatus[] = ['open', 'in_progress', 'done', 'carried_over', 'dropped']

// ─── Action Item Row ──────────────────────────────────────────────────────────

function ActionItemRow({
  item, teamId, teamMembers, onUpdate,
}: {
  item: ActionItemData
  teamId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [optimisticStatus, setOptimisticStatus] = useState<ActionItemStatus>(item.status)
  const cfg = STATUS_CONFIG[optimisticStatus]
  const assignee = item.assigneeId
    ? teamMembers.find((m) => m.userId === item.assigneeId)
    : null

  function setStatus(status: ActionItemStatus) {
    const prev = optimisticStatus
    setOptimisticStatus(status)
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/action-items/${item.id}`, { status })
        onUpdate()
      } catch (err) {
        setOptimisticStatus(prev)
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      }
    })
  }

  return (
    <div className="flex items-start gap-3 py-2.5 group border-b border-border last:border-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={pending}>
          <button className="shrink-0 mt-0.5" title="Change status">
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] font-medium border cursor-pointer hover:opacity-80 transition-opacity ${cfg.className}`}
            >
              {cfg.label}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s]
            return (
              <DropdownMenuItem key={s} onClick={() => setStatus(s)} className="gap-2 text-xs">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${c.className}`}>
                  {c.label}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${optimisticStatus === 'done' || optimisticStatus === 'dropped' ? 'line-through text-muted-foreground' : ''}`}>
          {item.text}
        </p>
        {assignee && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{assignee.displayName}</p>
        )}
      </div>
    </div>
  )
}

// ─── Carry-over Row ───────────────────────────────────────────────────────────

function CarryOverRow({
  item, teamId, sprintId, teamMembers, onUpdate,
}: {
  item: ActionItemData
  teamId: string
  sprintId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}) {
  const [pending, startTransition] = useTransition()
  const assignee = item.assigneeId
    ? teamMembers.find((m) => m.userId === item.assigneeId)
    : null

  function carryOver() {
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints/${sprintId}/carry-over/${item.id}`, {})
        toast.success('Action item carried over')
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to carry over')
      }
    })
  }

  function drop() {
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/action-items/${item.id}/drop`, {})
        toast.success('Action item dropped')
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to drop')
      }
    })
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{item.text}</p>
        {assignee && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{assignee.displayName}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px] px-2"
          onClick={carryOver} disabled={pending}>
          <ArrowDownToLine className="size-3" />
          Carry over
        </Button>
        <Button size="sm" variant="ghost" className="h-6 gap-1 text-[11px] px-2 text-muted-foreground"
          onClick={drop} disabled={pending}>
          <X className="size-3" />
          Drop
        </Button>
      </div>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function ActionItemsSection({ sprint, teamId, teamMembers, carryOverItems, onUpdate }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [newText, setNewText] = useState('')
  const [newAssignee, setNewAssignee] = useState('none')
  const [pending, startTransition] = useTransition()

  // Only show planning-type action items in this section (retro items handled in retro flow)
  const currentItems = sprint.action_items.filter(
    (i) => i.status !== 'dropped' && i.status !== 'carried_over'
  )

  // Carry-over: exclude items already carried over in this session
  const pendingCarryOver = carryOverItems.filter(
    (i) => i.status !== 'carried_over' && i.status !== 'dropped'
  )

  function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newText.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints/${sprint.id}/action-items`, {
          text:       newText.trim(),
          assigneeId: newAssignee === 'none' ? null : newAssignee,
        })
        setNewText('')
        setNewAssignee('none')
        setAddOpen(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add action item')
      }
    })
  }

  return (
    <section className="space-y-6">
      {/* Current sprint action items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Action Items
          </h2>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2"
            onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add item
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card px-4">
          {currentItems.length === 0 && !addOpen ? (
            <p className="py-4 text-xs text-muted-foreground text-center">
              No action items for this sprint yet.
            </p>
          ) : (
            currentItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                teamId={teamId}
                teamMembers={teamMembers}
                onUpdate={onUpdate}
              />
            ))
          )}

          {addOpen && (
            <form onSubmit={addItem} className="border-t border-border pt-3 pb-3 space-y-2">
              <input
                autoFocus
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                disabled={pending}
              />
              {teamMembers.length > 0 && (
                <Select value={newAssignee} onValueChange={setNewAssignee} disabled={pending}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">No assignee</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.userId} value={m.userId} className="text-xs">
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-7 text-xs px-3" disabled={pending || !newText.trim()}>
                  Add
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2"
                  onClick={() => { setNewText(''); setNewAssignee('none'); setAddOpen(false) }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Carry-over from previous sprint */}
      {pendingCarryOver.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Carry Over from Previous Sprint
          </h2>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4">
            {pendingCarryOver.map((item) => (
              <CarryOverRow
                key={item.id}
                item={item}
                teamId={teamId}
                sprintId={sprint.id}
                teamMembers={teamMembers}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
