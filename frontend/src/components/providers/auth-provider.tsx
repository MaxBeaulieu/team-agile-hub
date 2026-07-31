'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { administersAnyTeam, belongsToAnyTeam, canSeeRetros, type Me } from '@/lib/permissions'

interface AuthContextValue {
  me: Me | null
  loading: boolean
  /** Re-fetch after something that changes roles (joining a team, a role change). */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  me: null,
  loading: true,
  refresh: async () => {},
})

/**
 * Fetches `/api/me` once on mount so every component can ask about permissions without
 * re-deriving roles from whatever team object it happens to be holding.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/me'))
    } catch {
      // Not fatal: the page still renders, just with no elevated affordances.
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ me, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useMe() {
  return useContext(AuthContext)
}

/**
 * Renders children only for users who administer at least one team.
 * Server-rendered children can be passed straight through.
 */
export function TeamAdminOnly({ children }: { children: React.ReactNode }) {
  const { me } = useMe()
  return administersAnyTeam(me) ? <>{children}</> : null
}

/**
 * Renders children only for users who belong to at least one team.
 * Used for the ceremony nav, which is a dead end without a team.
 */
export function TeamMemberOnly({ children }: { children: React.ReactNode }) {
  const { me } = useMe()
  return belongsToAnyTeam(me) ? <>{children}</> : null
}

/** Teams, or any retro history — an invite-link guest keeps their way back in. */
export function RetroAccessOnly({ children }: { children: React.ReactNode }) {
  const { me } = useMe()
  return canSeeRetros(me) ? <>{children}</> : null
}

/**
 * The inverse of TeamMemberOnly, for explaining the empty nav.
 * Waits for /api/me to land — otherwise it flashes for everyone on first paint.
 */
export function NoTeamOnly({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe()
  if (loading || !me) return null
  return belongsToAnyTeam(me) ? null : <>{children}</>
}
