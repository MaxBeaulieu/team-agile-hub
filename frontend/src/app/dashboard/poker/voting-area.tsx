'use client'

import { useState } from 'react'
import { Eye, SkipForward, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { PokerData, PokerTicket, PokerVote } from './page'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data: PokerData
  teamId: string
  sessionId: string
  currentUserId: string
  onRefresh: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function voteCountsByEstimate(votes: PokerVote[]): Record<string, number> {
  return votes.reduce<Record<string, number>>((acc, v) => {
    acc[v.estimate] = (acc[v.estimate] ?? 0) + 1
    return acc
  }, {})
}

function unanimousEstimate(votes: PokerVote[]): string | null {
  if (!votes.length) return null
  const first = votes[0].estimate
  return votes.every(v => v.estimate === first) ? first : null
}

// ─── Small card button ────────────────────────────────────────────────────────

function DeckCard({
  value, selected, disabled, onClick,
}: { value: string; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center rounded-lg border-2 font-bold transition-all select-none',
        'h-16 w-11 text-sm',
        selected
          ? 'border-primary bg-primary text-primary-foreground scale-110 shadow-lg'
          : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent/50',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {value}
    </button>
  )
}

// ─── Vote summary row ─────────────────────────────────────────────────────────

function VoteSummary({ votes, deck }: { votes: PokerVote[]; deck: string[] }) {
  const counts = voteCountsByEstimate(votes)
  const sorted = deck.filter(d => counts[d])

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {sorted.map(val => (
        <div key={val} className="flex flex-col items-center gap-1">
          <div className={[
            'flex items-center justify-center rounded-md border-2 font-bold h-14 w-10 text-sm',
            'border-primary bg-primary/10 text-primary',
          ].join(' ')}>
            {val}
          </div>
          <span className="text-[10px] text-muted-foreground">
            ×{counts[val]}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VotingArea({ data, teamId, sessionId, currentUserId, onRefresh }: Props) {
  const { session, tickets, teamMembers, deck } = data
  const isFacilitator = session.facilitatorId === currentUserId

  const currentTicket: PokerTicket | undefined = tickets.find(
    t => t.id === session.currentTicketId
  )

  const [voting, setVoting]       = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [finalPts, setFinalPts]   = useState('')
  const [settingPts, setSettingPts] = useState(false)

  const myVote = currentTicket?.votes?.find(v => v.userId === currentUserId)?.estimate ?? null

  async function handleVote(estimate: string) {
    if (!currentTicket) return
    setVoting(true)
    try {
      await api.post(`/api/teams/${teamId}/poker/${sessionId}/vote`, {
        ticketId: currentTicket.id,
        estimate,
      })
      onRefresh()
    } catch {
      toast.error('Failed to cast vote')
    } finally {
      setVoting(false)
    }
  }

  async function handleReveal() {
    if (!currentTicket) return
    setRevealing(true)
    try {
      await api.post(`/api/teams/${teamId}/poker/${sessionId}/reveal`, {
        ticketId: currentTicket.id,
      })
      onRefresh()
    } catch {
      toast.error('Failed to reveal votes')
    } finally {
      setRevealing(false)
    }
  }

  async function handleSetPoints(e: React.FormEvent) {
    e.preventDefault()
    if (!currentTicket || !finalPts.trim()) return
    const pts = parseInt(finalPts, 10)
    if (isNaN(pts)) { toast.error('Enter a valid number'); return }
    setSettingPts(true)
    try {
      await api.patch(`/api/teams/${teamId}/poker/${sessionId}/tickets/${currentTicket.id}`, {
        finalPoints: pts,
        advanceToNext: true,
      })
      setFinalPts('')
      onRefresh()
    } catch {
      toast.error('Failed to set points')
    } finally {
      setSettingPts(false)
    }
  }

  async function handleSkip() {
    if (!currentTicket) return
    setAdvancing(true)
    try {
      await api.patch(`/api/teams/${teamId}/poker/${sessionId}/tickets/${currentTicket.id}`, {
        advanceToNext: true,
      })
      onRefresh()
    } catch {
      toast.error('Failed to skip ticket')
    } finally {
      setAdvancing(false)
    }
  }

  // ─── Pending / no session yet ────────────────────────────────────────────

  if (session.status === 'Pending') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
        <p className="text-sm text-muted-foreground">
          {tickets.length === 0
            ? 'Add tickets using the sidebar to begin.'
            : 'Add a ticket to automatically start the session.'}
        </p>
      </div>
    )
  }

  // ─── Completed ───────────────────────────────────────────────────────────

  if (session.status === 'Completed') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
        <CheckCircle2 className="size-10 text-green-500" />
        <p className="text-base font-semibold">Session complete!</p>
        <p className="text-xs text-muted-foreground">All tickets have been estimated.</p>
      </div>
    )
  }

  // ─── No current ticket ────────────────────────────────────────────────────

  if (!currentTicket) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {isFacilitator
            ? 'Select a ticket from the sidebar to begin voting.'
            : 'Waiting for the facilitator to select a ticket…'}
        </p>
      </div>
    )
  }

  const revealed      = currentTicket.votesRevealed
  const votes         = currentTicket.votes ?? []
  const voterIds      = new Set(votes.map(v => v.userId))
  const totalVoters   = teamMembers.length
  const voteCount     = votes.length
  const unanimous     = revealed ? unanimousEstimate(votes) : null

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-6 gap-6">

      {/* Current ticket info */}
      <div className="max-w-xl mx-auto w-full">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
            Currently estimating
          </p>
          <h2 className="text-base font-semibold">{currentTicket.title}</h2>
          {currentTicket.jiraIssueId && (
            <p className="text-xs text-muted-foreground mt-0.5">{currentTicket.jiraIssueId}</p>
          )}
          {currentTicket.description && (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              {currentTicket.description}
            </p>
          )}
        </div>
      </div>

      {/* Vote progress */}
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">Votes ({voteCount}/{totalVoters})</p>
          {revealed && (
            <span className="text-[10px] font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
              Revealed
            </span>
          )}
        </div>

        {/* Avatar vote chips */}
        <div className="flex flex-wrap gap-2">
          {teamMembers.map(member => {
            const voted = voterIds.has(member.userId)
            const memberVote = revealed ? votes.find(v => v.userId === member.userId) : null
            return (
              <div
                key={member.id}
                className={[
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors',
                  voted
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground',
                ].join(' ')}
              >
                <span className={[
                  'size-1.5 rounded-full',
                  voted ? 'bg-primary' : 'bg-muted-foreground/30',
                ].join(' ')} />
                {member.displayName}
                {memberVote && (
                  <span className="font-bold ml-0.5">{memberVote.estimate}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Revealed vote summary */}
      {revealed && votes.length > 0 && (
        <div className="max-w-xl mx-auto w-full">
          <VoteSummary votes={votes} deck={deck} />
          {unanimous && (
            <p className="text-center text-sm font-semibold text-green-500 mt-3">
              Unanimous! Everyone voted {unanimous}
            </p>
          )}
        </div>
      )}

      {/* My vote / deck */}
      {!revealed && (
        <div className="max-w-xl mx-auto w-full">
          <p className="text-xs text-muted-foreground mb-3 text-center">
            {myVote ? `Your vote: ${myVote} — pick another to change` : 'Pick your estimate'}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {deck.map(value => (
              <DeckCard
                key={value}
                value={value}
                selected={myVote === value}
                disabled={voting}
                onClick={() => handleVote(value)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Facilitator controls */}
      {isFacilitator && (
        <div className="max-w-xl mx-auto w-full border-t border-border pt-4 flex flex-col gap-3">
          {!revealed ? (
            <Button
              onClick={handleReveal}
              disabled={revealing || voteCount === 0}
              size="sm"
              className="w-full"
            >
              <Eye className="size-3.5 mr-1.5" />
              {revealing ? 'Revealing…' : 'Reveal Votes'}
            </Button>
          ) : (
            <form onSubmit={handleSetPoints} className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder={unanimous ?? 'Final points'}
                value={finalPts}
                onChange={e => setFinalPts(e.target.value)}
                className="h-8 text-sm flex-1"
              />
              <Button type="submit" size="sm" className="h-8" disabled={settingPts}>
                <CheckCircle2 className="size-3.5 mr-1" />
                {settingPts ? 'Saving…' : 'Set & Next'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={advancing}
                onClick={handleSkip}
              >
                <SkipForward className="size-3.5" />
                Skip
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
