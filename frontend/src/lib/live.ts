'use client'

import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { getAccessToken } from '@/lib/auth'

export type PresenceEntry = {
  userId: string
  displayName: string
  isAnonymous: boolean
  isHost: boolean
}

type TopicSubscription = {
  refCount: number
  lastVersion: number
  invalidateListeners: Set<() => void>
  presenceListeners: Set<(entries: PresenceEntry[]) => void>
}

// Module-level, shared by every component — one WebSocket for the whole app, not
// one per component (architecture doc §2.1's reasoning for a single hub applies
// equally here: connection count matters more than organisational tidiness).
const topics = new Map<string, TopicSubscription>()
let connection: signalR.HubConnection | null = null
let startPromise: Promise<void> | null = null

function getConnection(): signalR.HubConnection {
  if (connection) return connection

  connection = new signalR.HubConnectionBuilder()
    // Relative URL: same-origin behind Caddy in production (see Caddyfile's
    // /hub/* route), and Next.js's dev-server proxy locally. accessTokenFactory
    // is required, not cookie-only: browsers can't attach a custom
    // Authorization header (or even see an httpOnly cookie) on a WebSocket
    // handshake, so SignalR appends the token as an `access_token` query
    // param instead — AuthExtensions.AddAppJwtAuth reads it from there for
    // `/hub/*` specifically. Resolves the open design question this TODO
    // used to track.
    .withUrl('/hub/live', { accessTokenFactory: () => getAccessToken() ?? '' })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .build()

  connection.on('Invalidate', (topic: string, version: number) => {
    const sub = topics.get(topic)
    if (!sub || version <= sub.lastVersion) return
    sub.lastVersion = version
    sub.invalidateListeners.forEach(fn => fn())
  })

  connection.on('Presence', (topic: string, entries: PresenceEntry[]) => {
    topics.get(topic)?.presenceListeners.forEach(fn => fn(entries))
  })

  connection.onreconnected(async () => {
    // Groups do not survive a reconnect — a reconnected client has a new
    // ConnectionId and belongs to no groups. Re-join every topic still in use and
    // refetch once to close the gap; that's the entire missed-message strategy
    // (architecture doc §2.4 ADR-4 — a refetch is idempotent and self-healing, so
    // there's no replay buffer or sequence-gap detection to build).
    for (const [topic, sub] of topics) {
      try {
        await connection!.invoke('JoinTopic', topic)
        sub.invalidateListeners.forEach(fn => fn())
      } catch {
        // Authorization may have changed while disconnected (e.g. kicked from a
        // retro) — nothing to do here beyond not crashing the reconnect loop.
      }
    }
  })

  return connection
}

async function ensureStarted(): Promise<signalR.HubConnection> {
  const conn = getConnection()
  if (conn.state === signalR.HubConnectionState.Disconnected) {
    startPromise = conn.start()
  }
  if (startPromise) await startPromise
  return conn
}

function subscribe(topic: string): TopicSubscription {
  let sub = topics.get(topic)
  if (!sub) {
    sub = { refCount: 0, lastVersion: 0, invalidateListeners: new Set(), presenceListeners: new Set() }
    topics.set(topic, sub)
  }
  sub.refCount++

  // First subscriber for this topic — join the group. Later subscribers (e.g. a
  // page's useLiveTopic and useRetroRoster's usePresence both watching the same
  // retro topic) piggyback on the existing membership.
  if (sub.refCount === 1) {
    ensureStarted()
      .then(conn => conn.invoke('JoinTopic', topic))
      .catch(() => {
        // Surfaces as "realtime doesn't work for this topic" rather than a crash —
        // acceptable degradation; the page still functions on its own data loads.
      })
  }

  return sub
}

function unsubscribe(topic: string): void {
  const sub = topics.get(topic)
  if (!sub) return
  sub.refCount--
  if (sub.refCount <= 0) {
    topics.delete(topic)
    if (connection?.state === signalR.HubConnectionState.Connected) {
      connection.invoke('LeaveTopic', topic).catch(() => {})
    }
  }
}

/**
 * Subscribes to invalidation events for one topic and calls `onInvalidate` — debounced
 * 300ms, same as every page's pre-migration Supabase debounce — whenever the topic's
 * version advances. `onInvalidate` should be the page's existing refetch function.
 */
export function useLiveTopic(topic: string | null, onInvalidate: () => void): void {
  const onInvalidateRef = useRef(onInvalidate)

  useEffect(() => {
    onInvalidateRef.current = onInvalidate
  }, [onInvalidate])

  useEffect(() => {
    if (!topic) return

    const sub = subscribe(topic)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const listener = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => onInvalidateRef.current(), 300)
    }
    sub.invalidateListeners.add(listener)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      sub.invalidateListeners.delete(listener)
      unsubscribe(topic)
    }
  }, [topic])
}

/**
 * Current roster for a topic — retro topics only (LiveHub never sends a Presence
 * message for poker/blockers topics; see architecture doc §2.3 and LiveHub.cs).
 * Presence updates are not debounced: they're already server-derived, small, and
 * membership changes should reflect promptly rather than lag behind the 300ms
 * invalidation debounce.
 */
export function usePresence(topic: string | null): PresenceEntry[] {
  const [entries, setEntries] = useState<PresenceEntry[]>([])

  useEffect(() => {
    if (!topic) return

    const sub = subscribe(topic)
    const listener = (next: PresenceEntry[]) => setEntries(next)
    sub.presenceListeners.add(listener)

    return () => {
      sub.presenceListeners.delete(listener)
      unsubscribe(topic)
    }
  }, [topic])

  // Returned directly rather than reset via setState when topic goes null/changes —
  // avoids a synchronous setState-in-effect; `entries` may lag one topic behind for
  // a single render in that case, masked by returning [] here instead.
  return topic ? entries : []
}
