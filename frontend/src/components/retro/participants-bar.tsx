'use client'

import { useState } from 'react'
import { Copy, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { rosterInitials, type RosterMember } from './types'

/**
 * Live participant strip shared by the sprint retro and the quick retro:
 * one bubble per person currently in the retro (team members and invite-link
 * guests alike), a "Copy invite link" action for the host, and a kick
 * affordance for the host on everyone else.
 * EE-156.
 */
export function ParticipantsBar({
  sessionId,
  roster,
  isHost,
  onRosterChange,
}: {
  sessionId: string
  roster: RosterMember[]
  isHost: boolean
  onRosterChange?: () => void
}) {
  const [copying, setCopying] = useState(false)

  async function copyInviteLink() {
    setCopying(true)
    try {
      const { inviteCode } = await api.get<{ inviteCode: string }>(`/api/retro/${sessionId}/invite`)
      const url = `${window.location.origin}/retro/join/${inviteCode}`
      await navigator.clipboard.writeText(url)
      toast.success('Invite link copied to clipboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate invite link')
    } finally {
      setCopying(false)
    }
  }

  async function kick(member: RosterMember) {
    if (!member.participantId) return
    try {
      await api.delete(`/api/retro/${sessionId}/participants/${member.participantId}`)
      toast.success(`Removed ${member.displayName}`)
      onRosterChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove participant')
    }
  }

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-border">
      <div className="flex items-center -space-x-2">
        {roster.map(member => (
          <div
            key={member.userId}
            className="group relative flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold"
            title={`${member.displayName}${member.isHost ? ' — host' : ''}${member.isAnonymous ? ' (guest)' : ''}`}
          >
            {rosterInitials(member.displayName)}
            {isHost && !member.isHost && member.participantId && (
              <button
                onClick={() => kick(member)}
                className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                title={`Remove ${member.displayName}`}
              >
                <UserX className="size-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <span className="text-xs text-muted-foreground tabular-nums">
        {roster.length} in the retro
      </span>

      {roster.some(m => m.isAnonymous) && (
        <Badge variant="secondary" className="text-[10px]">Guests joined via link</Badge>
      )}

      {isHost && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1.5 text-xs"
          onClick={copyInviteLink}
          disabled={copying}
        >
          <Copy className="size-3" />
          Copy invite link
        </Button>
      )}
    </div>
  )
}
