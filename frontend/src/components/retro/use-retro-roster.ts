'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RetroParticipantData, RosterMember } from './types'

type PresencePayload = {
  userId: string
  displayName: string
  isAnonymous: boolean
  isHost: boolean
}

/**
 * Tracks who currently has this retro open, using a Supabase Realtime Presence
 * channel. Nothing is written to the database: entries disappear as soon as a
 * tab closes or the connection drops.
 *
 * The presence key is the user id, so several tabs from the same person collapse
 * into a single roster entry.
 */
export function useRetroPresence(sessionId: string | null, me: PresencePayload | null) {
  const [presence, setPresence] = useState<PresencePayload[]>([])
  const supabase = useMemo(() => createClient(), [])

  const meUserId = me?.userId ?? null
  const meDisplayName = me?.displayName ?? ''
  const meIsAnonymous = me?.isAnonymous ?? false
  const meIsHost = me?.isHost ?? false

  useEffect(() => {
    if (!sessionId || !meUserId) return

    const payload: PresencePayload = {
      userId: meUserId,
      displayName: meDisplayName,
      isAnonymous: meIsAnonymous,
      isHost: meIsHost,
    }

    const channel = supabase.channel(`retro-presence:${sessionId}`, {
      config: { presence: { key: meUserId } },
    })

    const sync = () => {
      const state = channel.presenceState<PresencePayload>()
      const seen = new Map<string, PresencePayload>()
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          if (entry?.userId) seen.set(entry.userId, entry)
        }
      }
      setPresence([...seen.values()])
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') channel.track(payload)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, meUserId, meDisplayName, meIsAnonymous, meIsHost, supabase])

  return presence
}

/**
 * The retro roster: everyone who has joined the retro *and* currently has it
 * open. Presence payloads cover the window before a newcomer's participant row
 * reaches this client, and the local user is always included so the strip never
 * renders empty while the presence channel is still connecting.
 */
export function useRetroRoster(
  sessionId: string | null,
  participants: RetroParticipantData[],
  currentUserId: string,
): RosterMember[] {
  const mine = participants.find(p => p.userId === currentUserId) ?? null

  const me: PresencePayload | null = currentUserId
    ? {
        userId: currentUserId,
        displayName: mine?.displayName ?? 'You',
        isAnonymous: mine?.isAnonymous ?? false,
        isHost: mine?.isHost ?? false,
      }
    : null

  const presence = useRetroPresence(sessionId, me)

  return useMemo(() => {
    const byUserId = new Map(participants.map(p => [p.userId, p]))
    const present = new Map<string, PresencePayload>(presence.map(p => [p.userId, p]))
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
