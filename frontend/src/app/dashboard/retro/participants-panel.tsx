'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export type RetroParticipant = {
  id: string
  retroSessionId: string
  userId: string
  displayName: string
  isAnonymous: boolean
  isHost: boolean
  joinedAt: string
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

/**
 * Invite-link participants strip: shows everyone who has joined via the
 * invite link (anonymous or logged in), a "Copy invite link" action for the
 * host, and a kick affordance for the host on non-host participants.
 * EE-156.
 */
export function ParticipantsBar({
  sessionId, isHost,
}: {
  sessionId: string
  isHost: boolean
}) {
  const [participants, setParticipants] = useState<RetroParticipant[]>([])
  const [copying, setCopying] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const result = await api.get<RetroParticipant[]>(`/api/retro/${sessionId}/participants`)
      setParticipants(result)
    } catch {
      // Not everyone can see the participant list (e.g. hasn't joined via link yet) — ignore.
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`retro-participants:${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'retro_participants',
        filter: `retro_session_id=eq.${sessionId}`,
      }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, load, supabase])

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

  async function kick(participant: RetroParticipant) {
    try {
      await api.delete(`/api/retro/${sessionId}/participants/${participant.id}`)
      toast.success(`Removed ${participant.displayName}`)
      setParticipants(prev => prev.filter(p => p.id !== participant.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove participant')
    }
  }

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-border">
      <div className="flex items-center -space-x-2">
        {participants.map(p => (
          <div
            key={p.id}
            className="group relative flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold"
            title={p.displayName}
          >
            {initials(p.displayName)}
            {isHost && !p.isHost && (
              <button
                onClick={() => kick(p)}
                className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                title={`Remove ${p.displayName}`}
              >
                <UserX className="size-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {participants.some(p => p.isAnonymous) && (
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
