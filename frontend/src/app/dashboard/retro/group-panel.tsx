'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { buildGroupLabel, GROUP_LABEL_MAX } from '@/lib/retro-groups'
import { toast } from 'sonner'
import { Layers, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import type { RetroSession, RetroCard } from './page'

type Props = {
  session: RetroSession
  cards: RetroCard[]
  currentUserId: string
  teamId: string
  isFacilitator: boolean
  onRefresh: () => void
}

function GroupCard({
  card,
  selected,
  selectable,
  onToggle,
}: {
  card: RetroCard
  selected: boolean
  selectable: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={selectable ? onToggle : undefined}
      className={[
        'rounded-lg border px-3 py-2.5 text-sm select-none transition-all',
        selectable ? 'cursor-pointer' : 'cursor-default',
        selected
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : selectable
            ? 'border-border bg-card hover:border-primary/40'
            : 'border-border bg-card',
      ].join(' ')}
    >
      {card.groupLabel && (
        <span className="inline-block mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {card.groupLabel}
        </span>
      )}
      <p className="whitespace-pre-wrap break-words leading-snug">{card.content}</p>
      {selected && (
        <span className="inline-block mt-1 text-[10px] text-primary font-semibold">✓ selected</span>
      )}
    </div>
  )
}

function ColumnSection({
  column, cards, selected, onToggle, teamId, session, onRefresh, isFacilitator,
}: {
  column: string
  cards: RetroCard[]
  selected: Set<string>
  onToggle: (id: string) => void
  teamId: string
  session: RetroSession
  onRefresh: () => void
  isFacilitator: boolean
}) {
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function removeFromGroup(cardId: string) {
    setRemovingId(cardId)
    try {
      await api.patch(`/api/teams/${teamId}/retro/${session.id}/cards/${cardId}`, {
        groupId: '00000000-0000-0000-0000-000000000000', // Guid.Empty → backend clears groupId
        groupLabel: '',
      })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove from group')
    } finally {
      setRemovingId(null)
    }
  }

  // Group cards by groupId within this column
  const grouped: Record<string, RetroCard[]> = {}
  const ungrouped: RetroCard[] = []
  for (const c of cards) {
    if (c.groupId) {
      grouped[c.groupId] = grouped[c.groupId] ?? []
      grouped[c.groupId].push(c)
    } else {
      ungrouped.push(c)
    }
  }

  return (
    <div className="space-y-3 min-w-0">
      <h3 className="text-sm font-semibold">{column}</h3>

      {/* Grouped */}
      {Object.entries(grouped).map(([gid, gCards]) => (
        <div key={gid} className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
          {gCards[0].groupLabel && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
              {gCards[0].groupLabel}
            </p>
          )}
          {gCards.map(c => (
            <div key={c.id} className="relative">
              <GroupCard
                card={c}
                selected={selected.has(c.id)}
                selectable={isFacilitator}
                onToggle={() => onToggle(c.id)}
              />
              {isFacilitator && (
                <button
                  onClick={() => removeFromGroup(c.id)}
                  disabled={removingId === c.id}
                  title="Remove from group"
                  className="absolute -top-1 -right-1 size-4 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Ungrouped */}
      {ungrouped.map(c => (
        <GroupCard
          key={c.id}
          card={c}
          selected={selected.has(c.id)}
          selectable={isFacilitator}
          onToggle={() => onToggle(c.id)}
        />
      ))}

      {cards.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No cards</p>
      )}
    </div>
  )
}

export function GroupPanel({ session, cards, currentUserId, teamId, isFacilitator, onRefresh }: Props) {
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [labelOpen, setLabelOpen]   = useState(false)
  const [label, setLabel]           = useState('')
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [grouping, setGrouping]     = useState(false)

  const columns: string[] = JSON.parse(session.columnsJson)

  function toggleCard(id: string) {
    if (!isFacilitator) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() { setSelected(new Set()) }

  // Pull in every card of an already-existing group when one of its members is
  // selected, so a merge ends up with a single, accurate label.
  function resolveGroupIds(): string[] {
    const existingGroups = new Set(
      cards.filter(c => selected.has(c.id) && c.groupId).map(c => c.groupId as string)
    )
    return cards
      .filter(c => selected.has(c.id) || (c.groupId !== null && existingGroups.has(c.groupId)))
      .map(c => c.id)
  }

  /** Distinct groups the resolved selection already belongs to, in card order. */
  function existingGroupIds(ids: string[]): string[] {
    return [...new Set(
      cards.filter(c => ids.includes(c.id) && c.groupId).map(c => c.groupId as string)
    )]
  }

  /**
   * Where the selection lands: an existing group absorbs the loose cards, so its
   * id (which anchors the group's votes) survives. Only a fully-new selection
   * mints a new group id.
   */
  function targetGroupId(ids: string[]): string {
    return existingGroupIds(ids)[0] ?? ids[0]
  }

  function openGroupDialog() {
    const ids = resolveGroupIds()
    const groupCards = cards.filter(c => ids.includes(c.id))
    const groups = existingGroupIds(ids)
    // Adding to one existing group keeps its name; merging groups rebuilds one.
    const keptLabel =
      groups.length === 1
        ? cards.find(c => c.groupId === groups[0])?.groupLabel ?? ''
        : ''
    setPendingIds(ids)
    setLabel(keptLabel || buildGroupLabel(groupCards.map(c => c.content)))
    setLabelOpen(true)
  }

  async function groupSelected() {
    if (pendingIds.length < 2) return
    setGrouping(true)
    try {
      const groupId = targetGroupId(pendingIds)
      const groupLabel =
        label.trim() ||
        buildGroupLabel(cards.filter(c => pendingIds.includes(c.id)).map(c => c.content))
      await Promise.all(
        cards
          .filter(
            c =>
              pendingIds.includes(c.id) &&
              (c.groupId !== groupId || c.groupLabel !== (groupLabel || null))
          )
          .map(c =>
            api.patch(`/api/teams/${teamId}/retro/${session.id}/cards/${c.id}`, {
              groupId,
              groupLabel: groupLabel || null,
            })
          )
      )
      setLabel('')
      setPendingIds([])
      setLabelOpen(false)
      setSelected(new Set())
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to group cards')
    } finally {
      setGrouping(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Group</h2>
          <p className="text-xs text-muted-foreground">
            {isFacilitator
              ? 'Click cards to select them, then group similar ideas together.'
              : 'The facilitator is grouping similar ideas together.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                Clear
              </Button>
              {selected.size >= 2 && (
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={openGroupDialog}>
                  <Layers className="size-3" />
                  Group
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(col => (
          <ColumnSection
            key={col}
            column={col}
            cards={cards.filter(c => c.column === col)}
            selected={selected}
            onToggle={toggleCard}
            teamId={teamId}
            session={session}
            onRefresh={onRefresh}
            isFacilitator={isFacilitator}
          />
        ))}
      </div>

      {/* Group label dialog */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Group {pendingIds.length} cards</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-xs font-medium text-muted-foreground">
              Group name — auto-built from the cards, edit if you like
            </label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') groupSelected() }}
              placeholder="e.g. Communication issues"
              maxLength={GROUP_LABEL_MAX}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              The group is voted on as a single item.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setLabelOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={groupSelected} disabled={grouping}>
              {grouping ? 'Grouping…' : 'Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
