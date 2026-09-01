'use client'

import { useMemo } from 'react'
import { usePresence, type PresenceEntry } from '@/lib/live'
import type { RetroParticipantData, RosterMember } from './types'

/**
 * The retro roster: everyone who has joined the retro *and* currently has it open.
 * Presence entries come from LiveHub's server-derived `Presence(topic, entries)`
 * broadcast (architecture doc §2.3) — the roster no longer asserts its own identity
 * via `channel.track(payload)`; the server builds every entry from claims plus the
 * caller's `retro_participants` row, so a client can no longer appear as host by
 * lying about it.
 *
 * The local user is always included so the strip never renders empty while the hub
 * connection is still joining the topic — same behaviour as the pre-migration
 * Supabase presence channel.
 */
export function useRetroRoster(
  sessionId: string | null,
  participants: RetroParticipantData[],
  currentUserId: string,
): RosterMember[] {
  const topic = sessionId ? `retro:${sessionId}` : null
  const presence = usePresence(topic)

  const mine = participants.find(p => p.userId === currentUserId) ?? null
  const me: PresenceEntry | null = currentUserId
    ? {
        userId: currentUserId,
        displayName: mine?.displayName ?? 'You',
        isAnonymous: mine?.isAnonymous ?? false,
        isHost: mine?.isHost ?? false,
      }
    : null

  return useMemo(() => {
    const byUserId = new Map(participants.map(p => [p.userId, p]))
    const present = new Map<string, PresenceEntry>(presence.map(p => [p.userId, p]))
    if (me && !present.has(me.userId)) present.set(me.userId, me)

    const members: RosterMember[] = [...present.values()].map(entry => {
      const participant = byUserId.get(entry.userId)
      return {
        participantId: participant?.id ?? null,
        userId: entry.userId,
        displayName: participant?.displayName ?? entry.displayName,
        isAnonymous: participant?.isAnonymous ?? entry.isAnonymous,
        isHost: participant?.isHost ?? entry.isHost,
      }
    })

    const joinedAt = (userId: string) => byUserId.get(userId)?.joinedAt ?? ''

    return members.sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
      const byJoined = joinedAt(a.userId).localeCompare(joinedAt(b.userId))
      if (byJoined !== 0) return byJoined
      return a.displayName.localeCompare(b.displayName)
    })
    // `me` is rebuilt every render; its primitive fields are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, presence, me?.userId, me?.displayName, me?.isAnonymous, me?.isHost])
}
