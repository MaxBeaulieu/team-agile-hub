'use client'

import { useCallback, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { normalizeRole } from '@/lib/permissions'
import { toast } from 'sonner'
import type { SprintDetail, TeamMemberData } from './page'

interface Props {
  sprint: SprintDetail
  teamId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}

function MemberRow({
  member, sprint, teamId,
}: {
  member: TeamMemberData
  sprint: SprintDetail
  teamId: string
}) {
  const existing = sprint.sprint_members.find((m) => m.userId === member.userId)
  const existingTraining = sprint.sprint_trainings.find((t) => t.userId === member.userId)

  const [daysOff, setDaysOff] = useState(existing?.daysOff ?? '')
  const [capacity, setCapacity] = useState<number>(existing?.capacityScore ?? 5)
  const [training, setTraining] = useState(existingTraining?.description ?? '')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveCapacity = useCallback(async (value: number) => {
    try {
      await api.put(`/api/teams/${teamId}/sprints/${sprint.id}/members/${member.userId}`, {
        daysOff: daysOff || null,
        capacityScore: value,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save capacity')
    }
  }, [teamId, sprint.id, member.userId, daysOff])

  function handleCapacityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    setCapacity(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveCapacity(val), 600)
  }

  async function handleDaysOffBlur() {
    try {
      await api.put(`/api/teams/${teamId}/sprints/${sprint.id}/members/${member.userId}`, {
        daysOff: daysOff.trim() || null,
        capacityScore: capacity,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save days off')
    }
  }

  async function handleTrainingBlur() {
    if (!training.trim()) return
    try {
      await api.put(`/api/teams/${teamId}/sprints/${sprint.id}/training/${member.userId}`, {
        description: training.trim(),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save training')
    }
  }

  const initials = member.displayName
    .trim().split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
  const isAdmin = normalizeRole(member.role) === 'admin'

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-4 py-3 border-b border-border last:border-0">
      {/* Member */}
      <div className="flex items-center gap-2 min-w-[130px]">
        <div className="size-7 rounded-full bg-accent flex items-center justify-center text-[11px] font-semibold shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-xs font-medium truncate max-w-[100px]">{member.displayName.split(' ')[0]}</p>
          {isAdmin && <p className="text-[10px] text-muted-foreground">Admin</p>}
        </div>
      </div>

      {/* Days off */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Days off</label>
        <input
          value={daysOff}
          onChange={(e) => setDaysOff(e.target.value)}
          onBlur={handleDaysOffBlur}
          placeholder="e.g. Mon Apr 7"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Capacity */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
          Capacity <span className="text-foreground font-semibold">{capacity}</span>/10
        </label>
        <input
          type="range"
          min={1}
          max={10}
          value={capacity}
          onChange={handleCapacityChange}
          className="w-full accent-primary h-1.5"
        />
      </div>

      {/* Training */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Training</label>
        <input
          value={training}
          onChange={(e) => setTraining(e.target.value)}
          onBlur={handleTrainingBlur}
          placeholder="Training planned…"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  )
}

export function CapacitySection({ sprint, teamId, teamMembers }: Props) {
  return (
    <section>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Team Capacity
      </h2>

      {teamMembers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No team members found.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4">
          {/* Header row */}
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-4 py-2 border-b border-border">
            <div className="min-w-[130px]" />
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Days off</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Capacity</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Training</p>
          </div>

          {teamMembers.map((m) => (
            <MemberRow key={m.userId} member={m} sprint={sprint} teamId={teamId} />
          ))}
        </div>
      )}
    </section>
  )
}
