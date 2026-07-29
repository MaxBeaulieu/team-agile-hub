'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { CreateTeamDialog } from './create-team-dialog'
import { JoinTeamDialog } from './join-team-dialog'
import { TeamCard } from './team-card'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

export type TeamWithMembers = {
  id: string
  name: string
  sprintTerm: string
  createdBy: string
  createdAt: string
  team_members: {
    id: string
    userId: string
    displayName: string
    role: 'admin' | 'member'
    joinedAt: string
  }[]
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamWithMembers[]>([])
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)

  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<TeamWithMembers[]>('/api/teams')
      setTeams(data)
    } catch (err) {
      console.error('Failed to load teams:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email ?? '')
      }
    })
    loadTeams()
  }, [loadTeams])

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Teams</h1>
          {teams.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {teams.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <JoinTeamDialog userId={userId} onSuccess={loadTeams} />
          <CreateTeamDialog userId={userId} userEmail={userEmail} onSuccess={loadTeams} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <p className="text-xs text-muted-foreground">Loading teams…</p>
          </div>
        ) : teams.length === 0 ? (
          <EmptyState userId={userId} onSuccess={loadTeams} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} userId={userId} onUpdate={loadTeams} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

function EmptyState({ userId, onSuccess }: { userId: string; onSuccess: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent mb-4">
        <Users className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-semibold mb-1">No teams yet</h2>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
        Create a new team or join an existing one using an invite link from a team admin.
      </p>
      <div className="flex items-center gap-2 mt-6">
        <JoinTeamDialog userId={userId} onSuccess={onSuccess} />
        <CreateTeamDialog userId={userId} userEmail="" onSuccess={onSuccess} />
      </div>
    </div>
  )
}
