/**
 * Shared roster types for both retro surfaces (sprint retro and quick retro).
 *
 * A retro's roster has two halves:
 *  - durable: a `retro_participants` row for everyone who has opened the retro,
 *    returned by the retro endpoints as `participants`;
 *  - live: Supabase Realtime Presence, which says who has the page open *right
 *    now*.
 *
 * `RosterMember` is the intersection of the two — that's what the bubble strip,
 * the progress denominators and the per-person panels render.
 */

export type RetroParticipantData = {
  id: string
  retroSessionId: string
  userId: string
  displayName: string
  isAnonymous: boolean
  isHost: boolean
  joinedAt: string
}

export type RosterMember = {
  /** Null while the participant row hasn't been fetched yet (presence-only). */
  participantId: string | null
  userId: string
  displayName: string
  isAnonymous: boolean
  isHost: boolean
}

export function rosterInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function rosterFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}
