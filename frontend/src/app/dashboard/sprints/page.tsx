'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SprintCard } from './sprint-card'
import { CreateSprintDialog } from './create-sprint-dialog'
import { useMe } from '@/components/providers/auth-provider'
import { canManageSprints } from '@/lib/permissions'

// ─── Shared types ───────────────────────────────────────────────────────────

export type SprintStatus = 'planning' | 'active' | 'completed'

export type SprintMember = {
  id: string
  sprintId: string
  userId: string
  daysOff: string | null
  capacityScore: number | null
}

export type Sprint = {
  id: string
  teamId: string
  name: string
  goal: string | null
  previousGoal: string | null
  championId: string | null
  startDate: string
  endDate: string
  status: SprintStatus
  createdAt: string
  sprint_members: SprintMember[]
}

export type Team = {
  id: string
  name: string
  sprintTerm: string
  team_members: { id: string; userId: string; displayName: string; role: string }[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_ORDER: SprintStatus[] = ['active', 'planning', 'completed']

const STATUS_LABEL: Record<SprintStatus, string> = {
  active: 'Active',
  planning: 'Planning',
  completed: 'Completed',
}

function groupByStatus(sprints: Sprint[]) {
  const map: Partial<Record<SprintStatus, Sprint[]>> = {}
  for (const s of sprints) {
    if (!map[s.status]) map[s.status] = []
    map[s.status]!.push(s)
  }
  return map
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const { me } = useMe()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [userId, setUserId] = useState('')
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingSprints, setLoadingSprints] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // Fetch teams once on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .finally(() => setLoadingTeams(false))
  }, [])

  // Fetch sprints whenever selected team changes
  const loadSprints = useCallback(async (teamId: string) => {
    if (!teamId) return
    setLoadingSprints(true)
    try {
      const data = await api.get<Sprint[]>(`/api/teams/${teamId}/sprints`)
      setSprints(data)
    } catch (err) {
      console.error('Failed to load sprints:', err)
    } finally {
      setLoadingSprints(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeamId) loadSprints(selectedTeamId)
    else setSprints([])
  }, [selectedTeamId, loadSprints])

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)
  const sprintTerm = selectedTeam?.sprintTerm ?? 'Sprint'
  const canCreate = canManageSprints(me, selectedTeamId)
  const grouped = groupByStatus(sprints)

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Sprints</h1>
          {sprints.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {sprints.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Team selector */}
          {!loadingTeams && (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Select a team…" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedTeamId && canCreate && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New {sprintTerm}
            </Button>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-6">
        {loadingTeams ? (
          <EmptyState message="Loading teams…" />
        ) : teams.length === 0 ? (
          <EmptyState message="Create a team first to manage sprints." />
        ) : !selectedTeamId ? (
          <EmptyState message="Select a team above to see its sprints." />
        ) : loadingSprints ? (
          <EmptyState message={`Loading ${sprintTerm.toLowerCase()}s…`} />
        ) : sprints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
            <div className="rounded-full bg-accent p-4">
              <CalendarDays className="size-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No {sprintTerm.toLowerCase()}s yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {canCreate
                  ? `Create your first ${sprintTerm.toLowerCase()} to get started.`
                  : `A team admin needs to create the first ${sprintTerm.toLowerCase()}.`}
              </p>
            </div>
            {canCreate && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                New {sprintTerm}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {STATUS_ORDER.filter((s) => grouped[s]?.length).map((status) => (
              <section key={status}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {STATUS_LABEL[status]}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped[status]!.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      sprintTerm={sprintTerm}
                      teamId={selectedTeamId}
                      userId={userId}
                      teamMembers={selectedTeam?.team_members ?? []}
                      onUpdate={() => loadSprints(selectedTeamId)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {selectedTeam && (
        <CreateSprintDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          teamId={selectedTeam.id}
          sprintTerm={sprintTerm}
          teamMembers={selectedTeam.team_members}
          onSuccess={() => loadSprints(selectedTeamId)}
        />
      )}
    </>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}
