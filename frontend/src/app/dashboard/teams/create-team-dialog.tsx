'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
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
  userEmail: string
  onSuccess: () => void
}

export function CreateTeamDialog({ onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sprintTerm, setSprintTerm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pending, startTransition] = useTransition()

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) { setName(''); setSprintTerm(''); setDisplayName('') }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    startTransition(async () => {
      try {
        await api.post('/api/teams', {
          name: name.trim(),
          sprintTerm: sprintTerm.trim() || 'Sprint',
          displayName: displayName.trim() || undefined,
        })
        toast.success(`Team "${name.trim()}" created!`)
        handleOpen(false)
        onSuccess()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create team')
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="size-3.5" />
        New team
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              Set up your team workspace. You can invite members after creation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name <span className="text-destructive">*</span></Label>
              <Input
                id="team-name"
                placeholder="e.g. Platform Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sprint-term">Sprint term</Label>
              <Input
                id="sprint-term"
                placeholder="Sprint (default)"
                value={sprintTerm}
                onChange={(e) => setSprintTerm(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Customise the word used for sprints — e.g. "Mission", "Cycle", "Iteration".
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="display-name">Your display name</Label>
              <Input
                id="display-name"
                placeholder="Team Lead"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? 'Creating…' : 'Create team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
