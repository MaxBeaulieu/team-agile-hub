'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, CheckSquare2, Plus, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'

type EpicOption = { id: string; title: string; status: string }

const EPIC_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  on_track: { label: 'On Track', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  at_risk:  { label: 'At Risk',  className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  on_hold:  { label: 'On Hold',  className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  done:     { label: 'Done',     className: 'bg-muted text-muted-foreground border-transparent' },
}
import type {
  FocusTopicData, TalkingPointData, TalkingPointNoteData,
  SprintDetail, TeamMemberData,
} from './page'

interface Props {
  sprint: SprintDetail
  teamId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}

// ─── Note Row ─────────────────────────────────────────────────────────────────

function NoteRow({ note, teamId, onUpdate }: {
  note: TalkingPointNoteData
  teamId: string
  onUpdate: () => void
}) {
  const [pending, startTransition] = useTransition()

  function deleteNote() {
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/notes/${note.id}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete note')
      }
    })
  }

  return (
    <div className="flex items-start gap-2 group py-0.5">
      <span className="shrink-0 mt-1 size-1 rounded-full bg-muted-foreground/30" />
      <p className="flex-1 text-xs text-muted-foreground leading-relaxed">{note.content}</p>
      <button
        onClick={deleteNote}
        disabled={pending}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        title="Delete note"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

// ─── Talking Point Row ────────────────────────────────────────────────────────

function TalkingPointRow({ point, sprint, teamId, teamMembers, onUpdate }: {
  point: TalkingPointData
  sprint: SprintDetail
  teamId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(point.text)
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [addingAction, setAddingAction] = useState(false)
  const [actionText, setActionText] = useState('')
  const [actionAssignee, setActionAssignee] = useState('')
  const [pending, startTransition] = useTransition()

  const notes = point.talking_point_notes ?? []
  const actions = point.action_items ?? []

  function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editText.trim()) return
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/talking-points/${point.id}`, { text: editText.trim() })
        setEditing(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update')
      }
    })
  }

  function deletePoint() {
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/talking-points/${point.id}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/talking-points/${point.id}/notes`, { content: noteText.trim() })
        setNoteText('')
        setAddingNote(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add note')
      }
    })
  }

  function addAction(e: React.FormEvent) {
    e.preventDefault()
    if (!actionText.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints/${sprint.id}/action-items`, {
          text: actionText.trim(),
          assigneeId: actionAssignee || null,
          talkingPointId: point.id,
        })
        setActionText('')
        setActionAssignee('')
        setAddingAction(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add action item')
      }
    })
  }

  return (
    <div className="py-1">
      <div className="flex items-start gap-2 group">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded
            ? <ChevronDown className="size-3.5" />
            : <ChevronRight className="size-3.5" />}
        </button>

        {editing ? (
          <form onSubmit={saveEdit} className="flex-1 flex gap-1">
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              disabled={pending}
            />
            <Button type="submit" size="sm" className="h-6 text-xs px-2" disabled={pending || !editText.trim()}>Save</Button>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-1"
              onClick={() => { setEditText(point.text); setEditing(false) }}>✕</Button>
          </form>
        ) : (
          <>
            <span
              className="flex-1 text-sm leading-snug cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditing(true)}
              title="Click to edit"
            >
              {point.text}
            </span>
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {notes.length > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <MessageSquare className="size-3" /> {notes.length}
                </span>
              )}
              {actions.length > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <CheckSquare2 className="size-3" /> {actions.length}
                </span>
              )}
              <button
                onClick={deletePoint}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Delete talking point"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="ml-5 mt-1.5 space-y-2 border-l border-border/60 pl-3">
          {notes.length > 0 && (
            <div className="space-y-0.5">
              {notes.map((n) => (
                <NoteRow key={n.id} note={n} teamId={teamId} onUpdate={onUpdate} />
              ))}
            </div>
          )}

          {actions.length > 0 && (
            <div className="space-y-0.5">
              {actions.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckSquare2 className="size-3 shrink-0" />
                  <span className={a.status === 'done' ? 'line-through' : ''}>{a.text}</span>
                </div>
              ))}
            </div>
          )}

          {addingNote ? (
            <form onSubmit={addNote} className="flex gap-1">
              <input
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                disabled={pending}
              />
              <Button type="submit" size="sm" className="h-6 text-[10px] px-2" disabled={pending || !noteText.trim()}>Add</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-1"
                onClick={() => { setNoteText(''); setAddingNote(false) }}>✕</Button>
            </form>
          ) : (
            <button
              onClick={() => setAddingNote(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <MessageSquare className="size-3" /> Add note
            </button>
          )}

          {addingAction ? (
            <form onSubmit={addAction} className="flex flex-wrap gap-1">
              <input
                autoFocus
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder="Action item text…"
                className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                disabled={pending}
              />
              <select
                value={actionAssignee}
                onChange={(e) => setActionAssignee(e.target.value)}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName}</option>
                ))}
              </select>
              <Button type="submit" size="sm" className="h-6 text-[10px] px-2" disabled={pending || !actionText.trim()}>Add</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-1"
                onClick={() => { setActionText(''); setActionAssignee(''); setAddingAction(false) }}>✕</Button>
            </form>
          ) : (
            <button
              onClick={() => setAddingAction(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <CheckSquare2 className="size-3" /> Add action item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Topic Row ────────────────────────────────────────────────────────────────

function TopicRow({ topic, sprint, teamId, teamMembers, onUpdate }: {
  topic: FocusTopicData
  sprint: SprintDetail
  teamId: string
  teamMembers: TeamMemberData[]
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(topic.title)
  const [addingPoint, setAddingPoint] = useState(false)
  const [newPointText, setNewPointText] = useState('')
  const [pending, startTransition] = useTransition()

  const points = [...(topic.talking_points ?? [])].sort((a, b) => a.order - b.order)

  function saveTitle(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        await api.patch(`/api/teams/${teamId}/focus-topics/${topic.id}`, { title: title.trim() })
        setEditingTitle(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update')
      }
    })
  }

  function deleteTopic() {
    startTransition(async () => {
      try {
        await api.delete(`/api/teams/${teamId}/focus-topics/${topic.id}`)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete topic')
      }
    })
  }

  function addPoint(e: React.FormEvent) {
    e.preventDefault()
    if (!newPointText.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/focus-topics/${topic.id}/talking-points`, {
          text: newPointText.trim(),
        })
        setNewPointText('')
        setAddingPoint(false)
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add talking point')
      }
    })
  }

  return (
    <div className="py-2 group/topic border-b border-border last:border-0">
      <div className="flex items-start gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded
            ? <ChevronDown className="size-4" />
            : <ChevronRight className="size-4" />}
        </button>

        {editingTitle ? (
          <form onSubmit={saveTitle} className="flex-1 flex gap-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
              disabled={pending}
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-2" disabled={pending || !title.trim()}>Save</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-1"
              onClick={() => { setTitle(topic.title); setEditingTitle(false) }}>✕</Button>
          </form>
        ) : (
          <>
            <div
              className="flex-1 cursor-pointer"
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="text-sm font-medium leading-snug hover:text-primary transition-colors">
                {topic.title}
              </span>
              {topic.epicId && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-violet-500 bg-violet-500/10 border border-violet-500/20 rounded-full px-1.5 py-0.5">
                  <Layers className="size-2.5" /> Epic
                </span>
              )}
              {points.length > 0 && !expanded && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {points.length} point{points.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover/topic:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setEditingTitle(true) }}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs"
                title="Rename topic"
              >
                Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(true); setAddingPoint(true) }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Add talking point"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                onClick={deleteTopic}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Delete topic"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="ml-6 mt-2">
          {topic.content && (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{topic.content}</p>
          )}

          {points.length === 0 && !addingPoint && (
            <p className="text-xs text-muted-foreground italic py-1">No talking points yet.</p>
          )}

          {points.map((pt) => (
            <TalkingPointRow
              key={pt.id}
              point={pt}
              sprint={sprint}
              teamId={teamId}
              teamMembers={teamMembers}
              onUpdate={onUpdate}
            />
          ))}

          {addingPoint ? (
            <form onSubmit={addPoint} className="flex gap-1 mt-1.5">
              <input
                autoFocus
                value={newPointText}
                onChange={(e) => setNewPointText(e.target.value)}
                placeholder="Talking point…"
                className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                disabled={pending}
              />
              <Button type="submit" size="sm" className="h-7 text-xs px-2" disabled={pending || !newPointText.trim()}>Add</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-1"
                onClick={() => { setNewPointText(''); setAddingPoint(false) }}>✕</Button>
            </form>
          ) : (
            <button
              onClick={() => setAddingPoint(true)}
              className="mt-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Plus className="size-3" /> Add talking point
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function FocusTopicsSection({ sprint, teamId, teamMembers, onUpdate }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'custom' | 'epic'>('custom')
  const [newTitle, setNewTitle] = useState('')
  const [epics, setEpics] = useState<EpicOption[]>([])
  const [loadingEpics, setLoadingEpics] = useState(false)
  const [pending, startTransition] = useTransition()

  const topics = [...sprint.focus_topics].sort((a, b) => a.order - b.order)
  const linkedEpicIds = new Set(topics.map((t) => t.epicId).filter(Boolean))

  function openAdd(mode: 'custom' | 'epic') {
    setAddMode(mode)
    setAddOpen(true)
    if (mode === 'epic' && epics.length === 0) {
      setLoadingEpics(true)
      api.get<EpicOption[]>(`/api/teams/${teamId}/epics`)
        .then(setEpics)
        .catch(() => toast.error('Failed to load epics'))
        .finally(() => setLoadingEpics(false))
    }
  }

  function closeAdd() {
    setAddOpen(false)
    setNewTitle('')
  }

  function addCustomTopic(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints/${sprint.id}/focus-topics`, {
          title: newTitle.trim(),
          status: 'on_track',
        })
        closeAdd()
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add topic')
      }
    })
  }

  function addEpicTopic(epic: EpicOption) {
    startTransition(async () => {
      try {
        await api.post(`/api/teams/${teamId}/sprints/${sprint.id}/focus-topics`, {
          title: epic.title,
          epicId: epic.id,
          status: 'on_track',
        })
        closeAdd()
        onUpdate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add epic topic')
      }
    })
  }

  const availableEpics = epics.filter((e) => !linkedEpicIds.has(e.id))

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Sprint Focus
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2"
            onClick={() => openAdd('custom')}>
            <Plus className="size-3.5" /> Add topic
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2 text-violet-500 hover:text-violet-500 hover:bg-violet-500/10"
            onClick={() => openAdd('epic')}>
            <Layers className="size-3.5" /> Add epic
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-1">
        {topics.length === 0 && !addOpen && (
          <p className="py-4 text-xs text-muted-foreground text-center">
            No focus topics yet — add one to outline what the team is covering this sprint.
          </p>
        )}

        {topics.map((t) => (
          <TopicRow
            key={t.id}
            topic={t}
            sprint={sprint}
            teamId={teamId}
            teamMembers={teamMembers}
            onUpdate={onUpdate}
          />
        ))}

        {addOpen && addMode === 'custom' && (
          <form onSubmit={addCustomTopic} className="flex gap-2 border-t border-border pt-3 pb-3">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Topic title..."
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              disabled={pending}
            />
            <Button type="submit" size="sm" className="h-8 text-xs px-3" disabled={pending || !newTitle.trim()}>Add</Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={closeAdd}>Cancel</Button>
          </form>
        )}

        {addOpen && addMode === 'epic' && (
          <div className="border-t border-border pt-3 pb-3 space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Select an epic to add as a focus topic</p>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={closeAdd}>Cancel</Button>
            </div>
            {loadingEpics && (
              <p className="text-xs text-muted-foreground py-2">Loading epics...</p>
            )}
            {!loadingEpics && availableEpics.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2">
                {epics.length === 0 ? 'No epics found for this team.' : 'All epics are already added as focus topics.'}
              </p>
            )}
            {!loadingEpics && availableEpics.map((epic) => {
              const cfg = EPIC_STATUS_LABEL[epic.status] ?? EPIC_STATUS_LABEL.on_track
              return (
                <button
                  key={epic.id}
                  onClick={() => addEpicTopic(epic)}
                  disabled={pending}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-background hover:bg-accent px-3 py-2 text-left transition-colors disabled:opacity-50"
                >
                  <span className="text-sm font-medium">{epic.title}</span>
                  <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                    {cfg.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}