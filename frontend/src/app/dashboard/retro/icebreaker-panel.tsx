'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { RefreshCw, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RetroSession, TeamMemberData } from './page'
import type { RosterMember } from '@/components/retro/types'
import { rosterInitials, rosterFirstName } from '@/components/retro/types'

type Props = {
  session: RetroSession
  teamMembers: TeamMemberData[]
  roster: RosterMember[]
  currentUserId: string
  teamId: string
  isFacilitator: boolean
  onRefresh: () => void
}

export function IcebreakerPanel({
  session, teamMembers, roster, currentUserId, teamId, isFacilitator, onRefresh,
}: Props) {
  const [rolling, setRolling]           = useState(false)
  const [advancing, setAdvancing]       = useState(false)

  const speakerOrder: string[] = session.speakerOrderJson
    ? JSON.parse(session.speakerOrderJson)
    : []

  const currentIndex    = speakerOrder.indexOf(session.currentSpeakerId ?? '')
  const upNextId        = speakerOrder[currentIndex + 1] ?? null
  const remaining       = speakerOrder.slice(currentIndex + 1)

  // Speaker order can include guests (not on the team) and people who have
  // since left, so the roster is the primary name source with team members as
  // a fallback.
  const memberById: Record<string, { displayName: string }> = {
    ...Object.fromEntries(teamMembers.map(m => [m.userId, { displayName: m.displayName }])),
    ...Object.fromEntries(roster.map(m => [m.userId, { displayName: m.displayName }])),
  }
  const currentMember = session.currentSpeakerId ? memberById[session.currentSpeakerId] : null
  const isMyTurn      = session.currentSpeakerId === currentUserId

  async function reRoll() {
    setRolling(true)
    try {
      await api.post(`/api/teams/${teamId}/retro/${session.id}/icebreaker/roll`, {})
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-roll')
    } finally {
      setRolling(false)
    }
  }

  async function nextSpeaker() {
    setAdvancing(true)
    try {
      await api.patch(`/api/teams/${teamId}/retro/${session.id}/speaker`, { advance: true })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance speaker')
    } finally {
      setAdvancing(false)
    }
  }

  function getInitials(name: string) {
    return rosterInitials(name)
  }

  return (
    <div className="flex flex-col items-center gap-8 p-8 max-w-xl mx-auto w-full">
      {/* Question card */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-sm p-6 text-center space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Icebreaker Question
        </p>
        <p className="text-lg font-semibold leading-snug">
          {session.icebreakerQuestion ?? 'Loading question…'}
        </p>
        {isFacilitator && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={reRoll}
            disabled={rolling}
          >
            <RefreshCw className={['size-3', rolling ? 'animate-spin' : ''].join(' ')} />
            New question
          </Button>
        )}
      </div>

      {/* Current speaker spotlight */}
      {currentMember && (
        <div
          className={[
            'flex flex-col items-center gap-3 rounded-2xl border-2 px-8 py-5',
            isMyTurn
              ? 'border-primary bg-primary/5 shadow-lg'
              : 'border-border bg-card',
          ].join(' ')}
        >
          <div
            className={[
              'size-16 rounded-full flex items-center justify-center text-xl font-bold',
              isMyTurn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            ].join(' ')}
          >
            {getInitials(currentMember.displayName)}
          </div>
          <div className="text-center">
            <p className="font-semibold">{currentMember.displayName}</p>
            <p className={['text-xs', isMyTurn ? 'text-primary font-medium' : 'text-muted-foreground'].join(' ')}>
              {isMyTurn ? "It's your turn!" : 'Currently sharing'}
            </p>
          </div>
        </div>
      )}

      {/* Facilitator: next speaker button */}
      {isFacilitator && upNextId && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={nextSpeaker}
          disabled={advancing}
        >
          <ChevronRight className="size-3.5" />
          Next: {memberById[upNextId]?.displayName ?? 'Next'}
        </Button>
      )}

      {/* Queue strip */}
      {speakerOrder.length > 0 && (
        <div className="w-full space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
            Speaking order
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {speakerOrder.map((uid, i) => {
              const m        = memberById[uid]
              const done     = i < currentIndex
              const isCur    = i === currentIndex
              const initials = m ? getInitials(m.displayName) : '?'
              return (
                <div
                  key={uid}
                  title={m?.displayName}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all',
                    isCur ? 'border-primary bg-primary/10 text-primary' :
                    done  ? 'border-border bg-muted text-muted-foreground line-through opacity-50' :
                            'border-border bg-background text-foreground',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                      isCur ? 'bg-primary text-primary-foreground' :
                      done  ? 'bg-muted-foreground/20 text-muted-foreground' :
                              'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {initials}
                  </span>
                  {m ? rosterFirstName(m.displayName) : 'Unknown'}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* All done */}
      {!upNextId && currentMember && (
        <p className="text-xs text-muted-foreground text-center">
          Everyone has shared{isFacilitator ? '. Advance to Writing when ready.' : '.'}
        </p>
      )}
    </div>
  )
}
