'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { normalizeRole, type TeamRole } from '@/lib/permissions'
import { toast } from 'sonner'
import type { TeamWithMembers } from './page'

interface Props {
  team: TeamWithMembers
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

function initialsOf(name: string) {
  const trimmed = name?.trim()
  if (!trimmed) return '?'
  return trimmed.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function ManageMembersDialog({
  team, currentUserId, open, onOpenChange, onUpdate,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const members = team.team_members
  const adminCount = members.filter((m) => normalizeRole(m.role) === 'admin').length

  /**
   * A team with no admin is unmanageable — nobody could invite, rename, create
   * sprints or delete it. The backend rejects this too; this just explains why.
   */
  const isLastAdmin = (role: string) => normalizeRole(role) === 'admin' && adminCount === 1

  function changeRole(userId: string, role: TeamRole) {
    setBusyId(userId)
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${team.id}/members/${userId}`, { role })
        toast.success(role === 'admin' ? 'Promoted to admin' : 'Changed to member')
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not change the role')
      } finally {
        setBusyId(null)
      }
    })
  }

  function removeMember(userId: string, displayName: string) {
    setBusyId(userId)
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${team.id}/members/${userId}`)
        toast.success(`${displayName || 'Member'} removed from ${team.name}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove the member')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Members of {team.name}</DialogTitle>
          <DialogDescription>
            Admins manage the team, its sprints and its integrations. Members take part in
            every ceremony.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {members.map((m) => {
            const locked = isLastAdmin(m.role)
            const busy = pending && busyId === m.userId

            return (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {initialsOf(m.displayName)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {m.displayName || 'Unnamed'}
                    {m.userId === currentUserId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                  {locked && (
                    <p className="text-[11px] text-muted-foreground">
                      Last admin — promote someone else first
                    </p>
                  )}
                </div>

                <Select
                  value={normalizeRole(m.role) ?? 'member'}
                  onValueChange={(role) => changeRole(m.userId, role as TeamRole)}
                  disabled={locked || busy}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                    <SelectItem value="member" className="text-xs">Member</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={locked || busy}
                  aria-label={`Remove ${m.displayName || 'member'}`}
                  onClick={() => removeMember(m.userId, m.displayName)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
