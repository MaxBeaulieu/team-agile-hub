'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { groupCards, type CardGroup } from '@/lib/retro-groups'
import { toast } from 'sonner'
import { CheckCircle2, ChevronRight, Circle, ListChecks, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RetroSession, RetroCard, TeamMemberData, ActionItemData } from './page'

type Props = {
  session: RetroSession
  cards: RetroCard[]
  teamMembers: TeamMemberData[]
  actionItems: ActionItemData[]
  currentUserId: string
  teamId: string
  isFacilitator: boolean
  onRefresh: () => void
}

// Inline debounced notes editor per card
function NotesEditor({
  card, session, teamId, onRefresh,
}: {
  card: RetroCard
  session: RetroSession
  teamId: string
  onRefresh: () => void
}) {
  const [notes, setNotes]     = useState(card.discussionNotes ?? '')
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setNotes(val)
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/retro/${session.id}/cards/${card.id}`, {
          discussionNotes: val,
        })
        onRefresh()
      } catch {
        /* ignore transient save errors */
      }
    }, 700)
  }

  return (
    <textarea
      ref={textareaRef}
      value={notes}
      onChange={handleChange}
      placeholder="Discussion notes… (shared, last-write-wins)"
      rows={2}
      className="w-full resize-none bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 leading-snug"
      style={{ minHeight: '2.5rem' }}
    />
  )
}

// Action items already saved against a card — kept visible so they don't
// vanish the moment they're created (EE-160).
export function CardActionItems({
  items, teamMembers, className,
}: Readonly<{
  items: ActionItemData[]
  teamMembers: TeamMemberData[]
  className?: string
}>) {
  if (items.length === 0) return null

  return (
    <ul className={['space-y-1', className].filter(Boolean).join(' ')}>
      {items.map(item => {
        const assignee = item.assigneeId
          ? teamMembers.find(m => m.userId === item.assigneeId)?.displayName
          : null
        return (
          <li
            key={item.id}
            className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11px] leading-snug"
          >
            <ListChecks className="size-3 shrink-0 mt-0.5 text-primary" />
            <span className="break-words min-w-0">{item.text}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {assignee ?? 'Unassigned'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Action item creator attached to a specific card
function ActionItemCreator({
  card, session, teamMembers, teamId, onRefresh,
}: {
  card: RetroCard
  session: RetroSession
  teamMembers: TeamMemberData[]
  teamId: string
  onRefresh: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [text, setText]       = useState('')
  const [assignee, setAssignee] = useState('')
  const [saving, setSaving]   = useState(false)

  async function create() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await api.post(`/api/teams/${teamId}/retro/${session.id}/action-items`, {
        text: trimmed,
        assigneeId: assignee || null,
        retroCardId: card.id,
      })
      setText('')
      setAssignee('')
      setOpen(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create action item')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="size-3" /> Add action item
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') create() }}
        placeholder="Action item text…"
        autoFocus
        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-2">
        <select
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          className="flex-1 bg-transparent text-xs border border-border rounded px-1 py-0.5 outline-none text-muted-foreground"
        >
          <option value="">Unassigned</option>
          {teamMembers.map(m => (
            <option key={m.id} value={m.userId}>{m.displayName}</option>
          ))}
        </select>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={create} disabled={saving || !text.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// A group is discussed once every card it holds has been marked discussed.
function isGroupDiscussed(group: CardGroup<RetroCard>) {
  return group.cards.every(c => c.isDiscussed)
}

// A highlighted discussion item (the "spotlight"). Grouped cards are discussed
// as a single item — one stop per group, mirroring how voting treats groups.
function DiscussionGroup({
  group, isActive, isFacilitator, session, teamMembers, groupActionItems, teamId, onRefresh, onSetActive,
}: {
  group: CardGroup<RetroCard>
  isActive: boolean
  isFacilitator: boolean
  session: RetroSession
  teamMembers: TeamMemberData[]
  groupActionItems: ActionItemData[]
  teamId: string
  onRefresh: () => void
  onSetActive: (cardId: string) => void
}) {
  const [marking, setMarking] = useState(false)

  const anchor    = group.cards.find(c => c.id === group.anchorId) ?? group.cards[0]
  const discussed = isGroupDiscussed(group)
  // Notes live on the anchor card, but older per-card notes stay readable.
  const otherNotes = group.cards.filter(c => c.id !== anchor.id && c.discussionNotes?.trim())

  const statusIcon = discussed
    ? <CheckCircle2 className="size-4 text-primary shrink-0" />
    : <Circle className="size-4 text-muted-foreground shrink-0" />

  async function toggleDiscussed() {
    const next = !discussed
    setMarking(true)
    try {
      await Promise.all(
        group.cards
          .filter(c => c.isDiscussed !== next)
          .map(c => api.patch(`/api/teams/${teamId}/retro/${session.id}/cards/${c.id}`, {
            isDiscussed: next,
          })),
      )
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark discussed')
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className={[
        'rounded-xl border-2 transition-all',
        isActive
          ? 'border-primary bg-primary/5 shadow-md'
          : discussed
            ? 'border-border bg-muted/30 opacity-60'
            : 'border-border bg-card',
      ].join(' ')}
    >
      <div className="px-4 py-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {isFacilitator ? (
              <button
                onClick={toggleDiscussed}
                disabled={marking}
                aria-pressed={discussed}
                title={discussed ? 'Mark as not discussed' : 'Mark as discussed'}
                className="shrink-0 mt-0.5 rounded-full transition-colors hover:text-primary disabled:opacity-50"
              >
                {statusIcon}
              </button>
            ) : statusIcon}
            <div className="min-w-0 space-y-1">
              {group.label && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
              )}
              {group.isGroup ? (
                <ul className="space-y-1">
                  {group.cards.map(c => (
                    <li
                      key={c.id}
                      className="text-sm leading-snug whitespace-pre-wrap break-words before:mr-1.5 before:text-muted-foreground before:content-['•']"
                    >
                      {c.content}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-snug whitespace-pre-wrap break-words">{anchor.content}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {group.isGroup && (
              <span className="rounded-full bg-muted text-muted-foreground text-[11px] font-semibold px-2 py-0.5 tabular-nums">
                {group.cards.length} cards
              </span>
            )}
            {group.totalVotes > 0 && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold px-2 py-0.5 tabular-nums">
                {group.totalVotes} 🔥
              </span>
            )}
          </div>
        </div>

        {/* Notes editor (only on the active group) */}
        {isActive && (
          <div className="mt-2 rounded-md border border-border bg-background px-2.5 py-2">
            <NotesEditor card={anchor} session={session} teamId={teamId} onRefresh={onRefresh} />
          </div>
        )}

        {/* Saved notes stay readable once the group is no longer the spotlight */}
        {!isActive && anchor.discussionNotes?.trim() && (
          <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
            {anchor.discussionNotes}
          </p>
        )}
        {otherNotes.map(c => (
          <p
            key={c.id}
            className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words"
          >
            {c.discussionNotes}
          </p>
        ))}

        {/* Action items saved anywhere in this group */}
        <CardActionItems items={groupActionItems} teamMembers={teamMembers} className="pt-1" />

        {/* Action items + controls */}
        {isActive && (
          <div className="space-y-2 pt-1">
            <ActionItemCreator
              card={anchor}
              session={session}
              teamMembers={teamMembers}
              teamId={teamId}
              onRefresh={onRefresh}
            />
            {isFacilitator && !discussed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={toggleDiscussed}
                disabled={marking}
              >
                <CheckCircle2 className="size-3" />
                Mark Discussed
              </Button>
            )}
          </div>
        )}

        {/* Jump to group (facilitator, non-active) */}
        {isFacilitator && !isActive && !discussed && (
          <button
            onClick={() => onSetActive(anchor.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronRight className="size-3" /> Discuss this
          </button>
        )}
      </div>
    </div>
  )
}

export function DiscussPanel({
  session, cards, teamMembers, actionItems, currentUserId, teamId, isFacilitator, onRefresh,
}: Props) {
  const [settingActive, setSettingActive] = useState(false)

  async function setActiveCard(cardId: string) {
    if (settingActive) return
    setSettingActive(true)
    try {
      await api.patch(`/api/teams/${teamId}/retro/${session.id}/discuss`, {
        cardId,
        isDiscussed: false,
      })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set active card')
    } finally {
      setSettingActive(false)
    }
  }

  // Grouped cards are discussed as a single item, the way they're voted on.
  const groups = groupCards(cards)

  // Sort: not-discussed by votes desc, then discussed
  const sorted = [...groups].sort((a, b) => {
    const aDiscussed = isGroupDiscussed(a)
    const bDiscussed = isGroupDiscussed(b)
    if (aDiscussed !== bDiscussed) return aDiscussed ? 1 : -1
    const diff = b.totalVotes - a.totalVotes
    if (diff !== 0) return diff
    return a.key.localeCompare(b.key)
  })

  const discussedCount = groups.filter(isGroupDiscussed).length
  const totalGroups    = groups.length

  const itemsByCard = actionItems.reduce<Record<string, ActionItemData[]>>((acc, item) => {
    if (item.retroCardId) {
      const bucket = acc[item.retroCardId] ?? []
      bucket.push(item)
      acc[item.retroCardId] = bucket
    }
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Discuss</h2>
          <p className="text-xs text-muted-foreground">
            Topics sorted by votes — grouped cards are discussed together.
            Facilitator selects what to discuss next.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {discussedCount}/{totalGroups} topics discussed
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: totalGroups > 0 ? `${(discussedCount / totalGroups) * 100}%` : '0%' }}
        />
      </div>

      {/* Topics */}
      <div className="space-y-3">
        {sorted.map(group => (
          <DiscussionGroup
            key={group.key}
            group={group}
            isActive={group.cards.some(c => c.id === session.activeDiscussionCardId)}
            isFacilitator={isFacilitator}
            session={session}
            teamMembers={teamMembers}
            groupActionItems={group.cards.flatMap(c => itemsByCard[c.id] ?? [])}
            teamId={teamId}
            onRefresh={onRefresh}
            onSetActive={setActiveCard}
          />
        ))}
      </div>
    </div>
  )
}
