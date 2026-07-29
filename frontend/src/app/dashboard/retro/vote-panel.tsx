'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Minus, Plus } from 'lucide-react'
import type { RetroSession, RetroCard } from './page'

type Props = {
  session: RetroSession
  cards: RetroCard[]
  currentUserId: string
  teamId: string
  onRefresh: () => void
}

type VoteMap = Record<string, number>  // cardId → count

function VoteCard({
  card, myVotes, maxVotes, usedVotes, onChange,
}: {
  card: RetroCard
  myVotes: number
  maxVotes: number
  usedVotes: number
  onChange: (cardId: string, delta: number) => void
}) {
  const remaining = maxVotes - usedVotes

  // Total visible votes (own or all depending on phase config — server already hides others' if needed)
  const totalVotes = card.retro_votes.reduce((a, v) => a + v.count, 0)

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2">
      {card.groupLabel && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {card.groupLabel}
        </p>
      )}
      <p className="text-sm leading-snug whitespace-pre-wrap break-words">{card.content}</p>

      <div className="flex items-center justify-between">
        {/* Vote controls for own votes */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(card.id, -1)}
            disabled={myVotes === 0}
            className="size-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="size-3" />
          </button>
          <span className="text-sm font-semibold tabular-nums w-4 text-center">{myVotes}</span>
          <button
            onClick={() => onChange(card.id, +1)}
            disabled={remaining === 0}
            className="size-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {/* Total visible votes */}
        {totalVotes > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export function VotePanel({ session, cards, currentUserId, teamId, onRefresh }: Props) {
  const columns: string[] = JSON.parse(session.columnsJson)
  const maxVotes = session.voteCount

  // Initialize my votes from server state
  function initVotes(): VoteMap {
    const map: VoteMap = {}
    for (const c of cards) {
      const myVote = c.retro_votes.find(v => v.userId === currentUserId)
      map[c.id] = myVote?.count ?? 0
    }
    return map
  }

  const [myVotes, setMyVotes] = useState<VoteMap>(initVotes)
  const syncTimer             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncing             = useRef(false)

  // Resync local state when server data changes (e.g. realtime refresh)
  const cardsRef = useRef(cards)
  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  // On first load or when cards list changes identity, re-init if we have no local changes pending
  useEffect(() => {
    if (!syncTimer.current) {
      setMyVotes(initVotes())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  const usedVotes = Object.values(myVotes).reduce((a, b) => a + b, 0)

  const syncVotes = useCallback(async (votes: VoteMap) => {
    if (isSyncing.current) return
    isSyncing.current = true
    try {
      const entries = Object.entries(votes)
        .filter(([, count]) => count > 0)
        .map(([cardId, count]) => ({ cardId, count }))
      await api.put(`/api/teams/${teamId}/retro/${session.id}/votes`, entries)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save votes')
    } finally {
      isSyncing.current = false
    }
  }, [teamId, session.id, onRefresh])

  function handleChange(cardId: string, delta: number) {
    setMyVotes(prev => {
      const current = prev[cardId] ?? 0
      const used    = Object.values(prev).reduce((a, b) => a + b, 0)

      if (delta > 0 && used >= maxVotes) return prev
      if (delta < 0 && current === 0) return prev

      const next = { ...prev, [cardId]: current + delta }

      // Debounce sync
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => {
        syncTimer.current = null
        syncVotes(next)
      }, 800)

      return next
    })
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header + budget */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Vote</h2>
          <p className="text-xs text-muted-foreground">
            Distribute your votes across cards. You can put multiple votes on one card.
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tabular-nums">
          {usedVotes} / {maxVotes} votes used
        </div>
      </div>

      {/* Budget bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={[
            'h-full rounded-full transition-all',
            usedVotes >= maxVotes ? 'bg-amber-500' : 'bg-primary',
          ].join(' ')}
          style={{ width: `${Math.min((usedVotes / maxVotes) * 100, 100)}%` }}
        />
      </div>

      {/* Card columns */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(col => {
          const colCards = cards.filter(c => c.column === col)
          return (
            <div key={col} className="space-y-2.5 min-w-0">
              <h3 className="text-sm font-semibold">{col}</h3>
              {colCards.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No cards</p>
              ) : (
                colCards.map(card => (
                  <VoteCard
                    key={card.id}
                    card={card}
                    myVotes={myVotes[card.id] ?? 0}
                    maxVotes={maxVotes}
                    usedVotes={usedVotes}
                    onChange={handleChange}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
