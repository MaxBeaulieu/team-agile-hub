/**
 * Permission helpers — the frontend half of the RBAC model.
 *
 * Two independent scopes, mirroring the backend (see AuthorizationService.cs):
 *   • platform admin — org-wide, granted out of band. Governs resources that belong
 *     to no team: the office floor map and the desk defect queue.
 *   • team role      — 'admin' or 'member', per team.
 *
 * Facilitation is deliberately not a role: it is per ceremony session and is decided
 * by whoever created the retro/poker session.
 *
 * These are all pure functions over the `/api/me` payload. UI gating built on them is
 * a usability affordance only — every one of these rules is also enforced server side.
 */

export type TeamRole = 'admin' | 'member'

export interface MeTeam {
  teamId: string
  name: string
  role: TeamRole
}

export interface Me {
  userId: string
  email: string | null
  displayName: string
  isPlatformAdmin: boolean
  /** Has taken part in at least one retro — including as an invite-link guest. */
  hasRetroHistory: boolean
  teams: MeTeam[]
}

/**
 * The backend has served this enum as both 'admin' and 'Admin' historically
 * (migration 010 normalised the column, but old payloads and hand-written checks
 * still disagreed). Normalise in exactly one place.
 */
export function normalizeRole(role: string | null | undefined): TeamRole | null {
  const value = role?.trim().toLowerCase()
  return value === 'admin' || value === 'member' ? value : null
}

export function teamRole(me: Me | null, teamId: string | null | undefined): TeamRole | null {
  if (!me || !teamId) return null
  return normalizeRole(me.teams.find((t) => t.teamId === teamId)?.role)
}

export function isPlatformAdmin(me: Me | null): boolean {
  return me?.isPlatformAdmin ?? false
}

export function isTeamMember(me: Me | null, teamId: string | null | undefined): boolean {
  return teamRole(me, teamId) !== null
}

/** Team admin, or a platform admin (who administers every team). */
export function isTeamAdmin(me: Me | null, teamId: string | null | undefined): boolean {
  return teamRole(me, teamId) === 'admin' || isPlatformAdmin(me)
}

/** Rename the team, invite people, manage membership, delete it. */
export const canManageTeam = isTeamAdmin

/** Create, edit and delete sprints. Members still participate in everything inside them. */
export const canManageSprints = isTeamAdmin

/** Connect or disconnect Jira for a team. */
export const canManageIntegrations = isTeamAdmin

/** Unassign other people's desks, read and close the defect queue. */
export const canAdminFloor = isPlatformAdmin

/** True when the user administers at least one team — used to show team-admin-only nav. */
export function administersAnyTeam(me: Me | null): boolean {
  if (!me) return false
  return me.isPlatformAdmin || me.teams.some((t) => normalizeRole(t.role) === 'admin')
}

/**
 * Most ceremonies are scoped to a team, so their pages are dead ends for someone who
 * belongs to none — a team picker with nothing in it. Hide that nav rather than let
 * people walk into empty states.
 *
 * Deliberately NOT gated this way: Dashboard and Teams (the way out of this state),
 * and the Floor Map, which belongs to no team at all.
 */
export function belongsToAnyTeam(me: Me | null): boolean {
  return (me?.teams.length ?? 0) > 0
}

/**
 * The retro section is the one exception. People get pulled into a retro by invite
 * link without ever joining a team, and quick retros are personal — so once someone
 * has any retro history, they keep the entry point to get back to it.
 */
export function canSeeRetros(me: Me | null): boolean {
  return belongsToAnyTeam(me) || (me?.hasRetroHistory ?? false)
}
