'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface TeamMember {
  id: string
  userId: string
  displayName: string
  role: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  sprintTerm: string
  teamMembers: TeamMember[]
  onSuccess: () => void
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function twoWeeksFromNow() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

export function CreateSprintDialog({
  open, onOpenChange, teamId, sprintTerm, teamMembers, onSuccess,
}: Props) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(twoWeeksFromNow())
  const [championId, setChampionId] = useState<string>('none')
  const [pending, startTransition] = useTransition()

  function reset() {
    setName('')
    setGoal('')
    setStartDate(today())
    setEndDate(twoWeeksFromNow())
    setChampionId('none')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error(`${sprintTerm} name is required`)
      return
    }
    if (new Date(startDate) >= new Date(endDate)) {
      toast.error('End date must be after start date')
      return
    }

    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints`, {
          name: name.trim(),
          goal: goal.trim() || null,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          championId: championId === 'none' ? null : championId,
        })
        toast.success(`${sprintTerm} created!`)
        reset()
        onOpenChange(false)
        onSuccess()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to create ${sprintTerm.toLowerCase()}`)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!pending) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {sprintTerm}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name">{sprintTerm} name <span className="text-destructive">*</span></Label>
            <Input
              id="sprint-name"
              placeholder={`e.g. ${sprintTerm} 12`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              autoFocus
            />
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <Label htmlFor="sprint-goal">Goal <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="sprint-goal"
              placeholder="What does success look like?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={pending}
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-start">Start date</Label>
              <Input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-end">End date</Label>
              <Input
                id="sprint-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          {/* Champion */}
          {teamMembers.length > 0 && (
            <div className="space-y-1.5">
              <Label>Champion <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={championId} onValueChange={setChampionId} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="No champion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No champion</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { onOpenChange(false); reset() }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? 'Creating…' : `Create ${sprintTerm}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
