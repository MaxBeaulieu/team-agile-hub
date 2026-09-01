'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { AlertTriangle, ExternalLink, Plus, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useLiveTopic } from '@/lib/live'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockerStatus = 'Open' | 'InProgress' | 'Resolved'

type Blocker = {
  id: string
  teamId: string
  sprintId: string | null
  title: string
  description: string | null
  raisedBy: string
  ownerId: string | null
  status: BlockerStatus
  jiraIssueId: string | null
  createdAt: string
}

type Sprint = {
  id: string
  name: string
  status: string
}

type TeamMember = {
  id: string
  userId: string
  displayName: string
  role: string
}

type Team = {
  id: string
  name: string
  team_members: TeamMember[]
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BlockerStatus, { label: string; className: string; colClass: string }> = {
  Open:       { label: 'Open',        className: 'bg-red-500/10 text-red-500 border-red-500/20',       colClass: 'border-red-500/30' },
  InProgress: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', colClass: 'border-amber-500/30' },
  Resolved:   { label: 'Resolved',    className: 'bg-green-500/10 text-green-500 border-green-500/20', colClass: 'border-green-500/30' },
}

const ALL_STATUSES: BlockerStatus[] = ['Open', 'InProgress', 'Resolved']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMemberName(members: TeamMember[], userId: string | null) {
  if (!userId) return null
  return members.find((m) => m.userId === userId)?.displayName ?? null
}

// ─── Blocker Card ─────────────────────────────────────────────────────────────

function BlockerCard({
  blocker,
  members,
  sprints,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  blocker: Blocker
  members: TeamMember[]
  sprints: Sprint[]
  onEdit: (b: Blocker) => void
  onDelete: (b: Blocker) => void
  onStatusChange: (b: Blocker, s: BlockerStatus) => void
}) {
  const ownerName  = getMemberName(members, blocker.ownerId)
  const sprintName = sprints.find((s) => s.id === blocker.sprintId)?.name ?? null

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-shadow hover:shadow-sm">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug flex-1">{blocker.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6 shrink-0">
              <span className="sr-only">Actions</span>
              <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden="true">
                <circle cx="8" cy="3" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="13" r="1.2" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onEdit(blocker)} className="gap-2">
              <Pencil className="size-3.5" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(blocker)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {blocker.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{blocker.description}</p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {/* Status selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${STATUS_CONFIG[blocker.status].className}`}>
              {STATUS_CONFIG[blocker.status].label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-xs">
            {ALL_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === blocker.status}
                onClick={() => onStatusChange(blocker, s)}
                className="gap-2"
              >
                <span className={`inline-block size-2 rounded-full ${STATUS_CONFIG[s].className}`} />
                {STATUS_CONFIG[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {sprintName && (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full">
            {sprintName}
          </Badge>
        )}

        {ownerName && (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full">
            {ownerName}
          </Badge>
        )}

        {blocker.jiraIssueId && (
          <a
            href={`https://jira.atlassian.com/browse/${blocker.jiraIssueId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
          >
            {blocker.jiraIssueId}
            <ExternalLink className="size-2.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Blocker Dialog (Create / Edit) ───────────────────────────────────────────

function BlockerDialog({
  open,
  onOpenChange,
  teamId,
  members,
  sprints,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  teamId: string
  members: TeamMember[]
  sprints: Sprint[]
  existing: Blocker | null
  onSaved: () => void
}) {
  const isEdit = existing !== null
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [sprintId,    setSprintId]    = useState<string>('__none__')
  const [ownerId,     setOwnerId]     = useState<string>('__none__')
  const [jiraId,      setJiraId]      = useState('')
  const [pending, startTransition] = useTransition()

  // Populate fields when editing
  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? '')
      setDescription(existing?.description ?? '')
      setSprintId(existing?.sprintId ?? '__none__')
      setOwnerId(existing?.ownerId ?? '__none__')
      setJiraId(existing?.jiraIssueId ?? '')
    }
  }, [open, existing])

  function submit() {
    if (!title.trim()) { toast.error('Title is required'); return }
    startTransition(async () => {
      try {
        const body = {
          title:      title.trim(),
          description: description.trim() || null,
          sprintId:   sprintId === '__none__' ? null : sprintId,
          ownerId:    ownerId  === '__none__' ? null : ownerId,
          jiraIssueId: jiraId.trim() || null,
        }
        if (isEdit) {
          await api.patch(`/api/teams/${teamId}/blockers/${existing!.id}`, body)
          toast.success('Blocker updated')
        } else {
          await api.post(`/api/teams/${teamId}/blockers`, body)
          toast.success('Blocker created')
        }
        onOpenChange(false)
        onSaved()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save blocker')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Blocker' : 'New Blocker'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-title" className="text-xs">Title *</Label>
            <Input
              id="b-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's blocking the team?"
              className="text-sm"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-desc" className="text-xs">Description</Label>
            <textarea
              id="b-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="More context…"
              rows={3}
              className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Sprint */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Sprint (optional)</Label>
            <Select value={sprintId} onValueChange={setSprintId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="No sprint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">No sprint</SelectItem>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Owner */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Owner (optional)</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId} className="text-xs">{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Jira ID */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-jira" className="text-xs">Jira Issue ID (optional)</Label>
            <Input
              id="b-jira"
              value={jiraId}
              onChange={(e) => setJiraId(e.target.value)}
              placeholder="e.g. PROJ-123"
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteBlockerDialog({
  open,
  onOpenChange,
  blocker,
  teamId,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  blocker: Blocker | null
  teamId: string
  onDeleted: () => void
}) {
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (!blocker) return
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/blockers/${blocker.id}`)
        toast.success('Blocker deleted')
        onOpenChange(false)
        onDeleted()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete blocker?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          &ldquo;{blocker?.title}&rdquo; will be permanently removed.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlockersPage() {
  const [teams,          setTeams]          = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [sprints,        setSprints]        = useState<Sprint[]>([])
  const [blockers,       setBlockers]       = useState<Blocker[]>([])
  const [filterSprint,   setFilterSprint]   = useState('__all__')
  const [filterStatus,   setFilterStatus]   = useState<BlockerStatus | '__all__'>('__all__')
  const [loadingTeams,   setLoadingTeams]   = useState(true)
  const [loadingData,    setLoadingData]    = useState(false)

  const [createOpen,     setCreateOpen]     = useState(false)
  const [editTarget,     setEditTarget]     = useState<Blocker | null>(null)
  const [deleteTarget,   setDeleteTarget]   = useState<Blocker | null>(null)

  // ── Load teams once ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // ── Load sprints + blockers when team changes ─────────────────────────────
  const loadData = useCallback(async (teamId: string) => {
    if (!teamId) return
    setLoadingData(true)
    const [sprintResult, blockerResult] = await Promise.allSettled([
      api.get<Sprint[]>(`/api/teams/${teamId}/sprints`),
      api.get<Blocker[]>(`/api/teams/${teamId}/blockers`),
    ])
    if (sprintResult.status === 'fulfilled') setSprints(sprintResult.value)
    if (blockerResult.status === 'fulfilled') setBlockers(blockerResult.value)
    else toast.error(blockerResult.reason instanceof Error ? blockerResult.reason.message : 'Failed to load blockers')
    setLoadingData(false)
  }, [])

  useEffect(() => {
    if (selectedTeamId) {
      setFilterSprint('__all__')
      setFilterStatus('__all__')
      loadData(selectedTeamId)
    } else {
      setSprints([])
      setBlockers([])
    }
  }, [selectedTeamId, loadData])

  // ── Realtime ──────────────────────────────────────────────────────────────
  // Silent refresh — no loading spinner, unlike loadData. useLiveTopic debounces
  // internally now (see lib/live.ts), so this fires directly on Invalidate.
  const silentRefresh = useCallback(async () => {
    if (!selectedTeamId) return
    const result = await Promise.allSettled([
      api.get<Sprint[]>(`/api/teams/${selectedTeamId}/sprints`),
      api.get<Blocker[]>(`/api/teams/${selectedTeamId}/blockers`),
    ])
    if (result[0].status === 'fulfilled') setSprints(result[0].value)
    if (result[1].status === 'fulfilled') setBlockers(result[1].value)
  }, [selectedTeamId])

  useLiveTopic(selectedTeamId ? `blockers:${selectedTeamId}` : null, silentRefresh)

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleStatusChange(blocker: Blocker, status: BlockerStatus) {
    // Optimistic update — move the card immediately, no loading flash
    setBlockers((prev) => prev.map((b) => b.id === blocker.id ? { ...b, status } : b))
    api.patch(`/api/teams/${selectedTeamId}/blockers/${blocker.id}`, { status })
      .catch((err) => {
        // Roll back on failure
        setBlockers((prev) => prev.map((b) => b.id === blocker.id ? { ...b, status: blocker.status } : b))
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      })
  }

  // ── Filtering ──────────────────────────────────────────────────────────
  const filtered = blockers.filter((b) => {
    if (filterSprint !== '__all__' && b.sprintId !== filterSprint) return false
    if (filterStatus !== '__all__' && b.status   !== filterStatus) return false
    return true
  })

  const byStatus = (status: BlockerStatus) => filtered.filter((b) => b.status === status)

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)
  const members      = selectedTeam?.team_members ?? []

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Blockers</h1>
          {blockers.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {blockers.length}
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
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sprint filter */}
          {selectedTeamId && sprints.length > 0 && (
            <Select value={filterSprint} onValueChange={setFilterSprint}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All sprints" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">All sprints</SelectItem>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Status filter */}
          {selectedTeamId && (
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as BlockerStatus | '__all__')}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">All statuses</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* New Blocker */}
          {selectedTeamId && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New Blocker
            </Button>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-6">
        {loadingTeams ? (
          <EmptyState message="Loading teams…" />
        ) : teams.length === 0 ? (
          <EmptyState message="Create a team first to track blockers." />
        ) : !selectedTeamId ? (
          <EmptyState message="Select a team above to see its blockers." />
        ) : loadingData ? (
          <EmptyState message="Loading blockers…" />
        ) : (
          /* Kanban columns */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-[400px]">
            {ALL_STATUSES.map((status) => {
              const cards = byStatus(status)
              return (
                <div key={status} className="flex flex-col gap-3">
                  {/* Column header */}
                  <div className={`flex items-center justify-between border-b pb-2 ${STATUS_CONFIG[status].colClass}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${STATUS_CONFIG[status].className.split(' ').find((c) => c.startsWith('text-'))}`}>
                        {STATUS_CONFIG[status].label}
                      </span>
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {cards.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2">
                    {cards.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No blockers</p>
                    ) : (
                      cards.map((b) => (
                        <BlockerCard
                          key={b.id}
                          blocker={b}
                          members={members}
                          sprints={sprints}
                          onEdit={(bl) => setEditTarget(bl)}
                          onDelete={(bl) => setDeleteTarget(bl)}
                          onStatusChange={handleStatusChange}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Create dialog */}
      <BlockerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teamId={selectedTeamId}
        members={members}
        sprints={sprints}
        existing={null}
        onSaved={() => loadData(selectedTeamId)}
      />

      {/* Edit dialog */}
      <BlockerDialog
        open={editTarget !== null}
        onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        teamId={selectedTeamId}
        members={members}
        sprints={sprints}
        existing={editTarget}
        onSaved={() => { setEditTarget(null); loadData(selectedTeamId) }}
      />

      {/* Delete dialog */}
      <DeleteBlockerDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
        blocker={deleteTarget}
        teamId={selectedTeamId}
        onDeleted={() => { setDeleteTarget(null); loadData(selectedTeamId) }}
      />
    </>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}
