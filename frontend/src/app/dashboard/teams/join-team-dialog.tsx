'use client'

import { useState, useTransition } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  userId: string
  onSuccess: () => void
}

export function JoinTeamDialog({ onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pending, startTransition] = useTransition()

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) { setToken(''); setDisplayName('') }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return

    startTransition(async () => {
      try {
        await api.post('/api/teams/join', {
          inviteToken: token.trim(),
          displayName: displayName.trim() || undefined,
        })
        toast.success('Joined team!')
        handleOpen(false)
        onSuccess()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to join team')
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <LogIn className="size-3.5" />
        Join team
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Join a team</DialogTitle>
            <DialogDescription>
              Paste the invite link or token you received from a team admin.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-token">Invite token <span className="text-destructive">*</span></Label>
              <Input
                id="invite-token"
                placeholder="Paste invite token…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="join-display-name">Your display name</Label>
              <Input
                id="join-display-name"
                placeholder="e.g. Alex"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !token.trim()}>
                {pending ? 'Joining…' : 'Join team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
