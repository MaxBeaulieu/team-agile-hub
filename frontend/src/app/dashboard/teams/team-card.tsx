'use client'

import { useState, useTransition } from 'react'
import { Copy, Link2, MoreHorizontal, Pencil, Settings, Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { TeamWithMembers } from './page'

interface Props {
  team: TeamWithMembers
  userId: string
  onUpdate: () => void
}

export function TeamCard({ team, userId, onUpdate }: Props) {
  const myMembership = team.team_members.find((m) => m.userId === userId)
  const isAdmin = myMembership?.role === 'admin'

  const [inviteOpen, setInviteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  const [newName, setNewName] = useState(team.name)
  const [newTerm, setNewTerm] = useState(team.sprintTerm)
  const [pending, startTransition] = useTransition()

  function generateInvite() {
    startTransition(async () => {
      try {
        const res = await api.post<{ inviteToken: string }>(`/api/teams/${team.id}/invite`, {})
        setInviteToken(res.inviteToken)
        setInviteOpen(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate invite')
      }
    })
  }

  function copyToken() {
    navigator.clipboard.writeText(inviteToken)
    toast.success('Invite token copied!')
  }

  function saveRename(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${team.id}`, { name: newName.trim(), sprintTerm: newTerm.trim() })
        toast.success('Team updated')
        setRenameOpen(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update team')
      }
    })
  }

  const initials = team.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
        {/* Card header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
              style={{ backgroundColor: '#a78bfa18', color: '#a78bfa' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{team.name}</h2>
              <p className="text-xs text-muted-foreground">{team.sprintTerm || 'Sprint'}-based</p>
            </div>
          </div>

          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={generateInvite} disabled={pending}>
                  <Link2 className="size-3.5 mr-2" />
                  Generate invite
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                  <Pencil className="size-3.5 mr-2" />
                  Rename / settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Members */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="size-3" />
              {team.team_members.length} member{team.team_members.length !== 1 ? 's' : ''}
            </span>
            {isAdmin && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin</Badge>
            )}
          </div>

          {/* Avatar stack */}
          <div className="flex -space-x-2">
            {team.team_members.slice(0, 6).map((m) => (
              <Avatar key={m.id} className="size-7 border-2 border-card">
                <AvatarFallback className="text-[10px]">
                  {m.displayName?.trim()
                    ? m.displayName.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
                    : '?'}
                </AvatarFallback>
              </Avatar>
            ))}
            {team.team_members.length > 6 && (
              <div className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-accent text-[10px] text-muted-foreground">
                +{team.team_members.length - 6}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite token dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite to {team.name}</DialogTitle>
            <DialogDescription>
              Share this token with anyone you want to add. It expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={inviteToken} readOnly className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={copyToken}>
              <Copy className="size-3.5" />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Team settings</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveRename} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-name">Team name</Label>
              <Input
                id="rename-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rename-term">Sprint term</Label>
              <Input
                id="rename-term"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="Sprint"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
