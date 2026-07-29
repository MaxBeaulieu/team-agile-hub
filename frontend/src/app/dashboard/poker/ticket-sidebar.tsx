'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronRight, CheckCircle2, Circle, Clock, Download, Search, Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { PokerData, PokerTicket } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  data: PokerData
  teamId: string
  sessionId: string
  currentUserId: string
  onRefresh: () => void
}

type JiraIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status:   { name: string }
    issuetype: { name: string }
    priority:  { name: string } | null
    assignee:  { displayName: string } | null
  }
}

type JiraProject = {
  id: string
  key: string
  name: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TicketSidebar({ data, teamId, sessionId, currentUserId, onRefresh }: Props) {
  const { session, tickets } = data
  const isFacilitator = session.facilitatorId === currentUserId
  const isCompleted   = session.status === 'Completed'

  const [addOpen, setAddOpen]       = useState(false)
  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [jiraId, setJiraId]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  // ── Jira import state ─────────────────────────────────────────────────────
  const [jiraConnected,  setJiraConnected]  = useState(false)
  const [importOpen,     setImportOpen]     = useState(false)
  const [projects,       setProjects]       = useState<JiraProject[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searching,      setSearching]      = useState(false)
  const [jiraIssues,     setJiraIssues]     = useState<JiraIssue[]>([])
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [importing,      setImporting]      = useState(false)

  // Check Jira status once (only for facilitators)
  useEffect(() => {
    if (!isFacilitator) return
    api.get<{ connected: boolean }>(`/api/teams/${teamId}/jira/status`)
      .then((s) => setJiraConnected(s.connected))
      .catch(() => {/* silent — Jira just won't show */})
  }, [isFacilitator, teamId])

  function openImportDialog() {
    setImportOpen(true)
    setSearchQuery('')
    setJiraIssues([])
    setSelected(new Set())
    if (projects.length === 0) {
      setLoadingProjects(true)
      api.get<{ values: JiraProject[] }>(`/api/teams/${teamId}/jira/projects`)
        .then((r) => {
          const list = r.values ?? []
          setProjects(list)
          if (list.length === 1) {
            setSelectedProject(list[0].key)
            // Auto-search for that project's issues immediately
            doSearch('', list[0].key)
          }
        })
        .catch(() => toast.error('Could not load Jira projects'))
        .finally(() => setLoadingProjects(false))
    } else if (projects.length === 1) {
      setSelectedProject(projects[0].key)
      doSearch('', projects[0].key)
    }
  }

  async function doSearch(query: string, projectKey?: string) {
    setSearching(true)
    setJiraIssues([])
    setSelected(new Set())
    try {
      const jql = buildJqlWith(query, projectKey ?? selectedProject)
      const raw = await api.get<{ issues: JiraIssue[] }>(
        `/api/teams/${teamId}/jira/issues?jql=${encodeURIComponent(jql)}`,
      )
      setJiraIssues(raw.issues ?? [])
      if ((raw.issues ?? []).length === 0) toast.info('No issues matched.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Jira search failed')
    } finally {
      setSearching(false)
    }
  }

  function buildJqlWith(input: string, projectKey: string): string {
    const trimmed = input.trim()
    const projectPrefix = projectKey ? `project = "${projectKey}" AND ` : ''
    if (!trimmed) return projectKey
      ? `project = "${projectKey}" order by created DESC`
      : 'project is not EMPTY order by created DESC'

    const tokens = trimmed.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean)
    const keyPattern = /^[A-Z][A-Z0-9_]+-\d+$/
    const numPattern = /^\d+$/

    // Fully qualified keys e.g. PAT-123
    const fullKeys = tokens.filter((t) => keyPattern.test(t))
    if (fullKeys.length > 0) return `key in (${fullKeys.join(', ')})`

    // Plain numbers e.g. "1246" → "PAT-1246" if project selected
    if (projectKey && tokens.every((t) => numPattern.test(t))) {
      const keys = tokens.map((n) => `${projectKey}-${n}`)
      return `key in (${keys.join(', ')})`
    }

    // Text search — include key contains so "1246" also matches PAT-1246
    return `${projectPrefix}(text ~ ${JSON.stringify(trimmed)} OR key ~ ${JSON.stringify(trimmed)}) order by created DESC`
  }

  async function handleJiraSearch() {
    await doSearch(searchQuery)
  }

  function toggleIssue(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleImport() {
    const toImport = jiraIssues.filter((i) => selected.has(i.id))
    if (toImport.length === 0) return
    setImporting(true)
    let ok = 0
    for (const issue of toImport) {
      try {
        await api.post(`/api/teams/${teamId}/poker/${sessionId}/tickets`, {
          title:       issue.fields.summary,
          description: null,
          jiraIssueId: issue.key,
        })
        ok++
      } catch {
        toast.error(`Failed to import ${issue.key}`)
      }
    }
    setImporting(false)
    if (ok > 0) {
      toast.success(`Imported ${ok} ticket${ok !== 1 ? 's' : ''}`)
      setImportOpen(false)
      setJiraIssues([])
      setSelected(new Set())
      onRefresh()
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.post(`/api/teams/${teamId}/poker/${sessionId}/tickets`, {
        title: title.trim(),
        description: description.trim() || null,
        jiraIssueId: jiraId.trim() || null,
      })
      setTitle(''); setDesc(''); setJiraId(''); setAddOpen(false)
      onRefresh()
    } catch {
      toast.error('Failed to add ticket')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(ticketId: string) {
    setDeleting(ticketId)
    try {
      await api.delete(`/api/teams/${teamId}/poker/${sessionId}/tickets/${ticketId}`)
      onRefresh()
    } catch {
      toast.error('Failed to delete ticket')
    } finally {
      setDeleting(null)
    }
  }

  async function handleSetCurrent(ticketId: string) {
    if (!isFacilitator) return
    try {
      await api.patch(`/api/teams/${teamId}/poker/${sessionId}/current`, { ticketId })
      onRefresh()
    } catch {
      toast.error('Failed to set current ticket')
    }
  }

  function ticketStatus(ticket: PokerTicket) {
    if (ticket.finalPoints !== null && ticket.finalPoints !== undefined) return 'done'
    if (ticket.id === session.currentTicketId) return 'active'
    return 'pending'
  }

  return (
    <>
    <aside className="flex flex-col w-72 shrink-0 border-r border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tickets ({tickets.length})
        </span>
        {isFacilitator && !isCompleted && (
          <div className="flex items-center gap-1">
            {jiraConnected && (
              <Button
                size="icon" variant="ghost" className="size-6"
                title="Import from Jira"
                onClick={() => openImportDialog()}
              >
                <Download className="size-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="size-6"
              onClick={() => setAddOpen(!addOpen)}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Add form */}
      {addOpen && (
        <form onSubmit={handleAdd} className="border-b border-border p-3 space-y-2 bg-accent/30">
          <Input
            autoFocus
            placeholder="Ticket title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-7 text-xs"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value)}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm resize-none min-h-[60px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Input
            placeholder="Jira ID (optional)"
            value={jiraId}
            onChange={e => setJiraId(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="h-6 text-xs flex-1" disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs"
              onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground text-center">
            No tickets yet.{isFacilitator ? ' Add one above.' : ''}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((ticket) => {
              const status  = ticketStatus(ticket)
              const active  = status === 'active'
              const done    = status === 'done'

              return (
                <li
                  key={ticket.id}
                  className={[
                    'flex items-start gap-2 px-3 py-2.5 group transition-colors',
                    active  ? 'bg-primary/8 border-l-2 border-l-primary' : '',
                    isFacilitator && !isCompleted && !active
                      ? 'cursor-pointer hover:bg-accent/50'
                      : '',
                  ].join(' ')}
                  onClick={() => {
                    if (isFacilitator && !isCompleted && !active) handleSetCurrent(ticket.id)
                  }}
                >
                  <div className="mt-0.5 shrink-0">
                    {done   ? <CheckCircle2 className="size-3.5 text-green-500" />
                    : active ? <Clock className="size-3.5 text-primary animate-pulse" />
                    :          <Circle className="size-3.5 text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={['text-xs truncate', done ? 'line-through text-muted-foreground' : ''].join(' ')}>
                      {ticket.title}
                    </p>
                    {ticket.jiraIssueId && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{ticket.jiraIssueId}</p>
                    )}
                    {done && ticket.finalPoints !== null && (
                      <p className="text-[10px] text-green-500 mt-0.5 font-medium">
                        {ticket.finalPoints} pts
                      </p>
                    )}
                  </div>
                  {active && (
                    <ChevronRight className="size-3 text-primary shrink-0 mt-0.5" />
                  )}
                  {isFacilitator && !isCompleted && !done && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(ticket.id) }}
                      disabled={deleting === ticket.id}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>

    {/* ── Jira import dialog ──────────────────────────────────────────────── */}
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Download className="size-4" /> Import from Jira
          </DialogTitle>
        </DialogHeader>

        {/* Project selector */}
        <div className="px-5 pb-3 shrink-0 border-b border-border">
          <div className="relative">
            {loadingProjects ? (
              <div className="flex items-center gap-2 h-8 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading projects…
              </div>
            ) : (
              <>
                <select
                  className="w-full h-8 text-xs rounded-md border border-input bg-transparent px-3 pr-8 appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedProject}
                  onChange={(e) => { setSelectedProject(e.target.value); setJiraIssues([]); setSelected(new Set()) }}
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              </>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-2 px-5 pb-3 shrink-0 border-b border-border">
          <Input
            autoFocus
            className="text-xs h-8 flex-1"
            placeholder="Ticket keys (e.g. PROJ-123, PROJ-124) or keyword…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJiraSearch() }}
          />
          <Button size="sm" className="h-8 shrink-0" onClick={handleJiraSearch} disabled={searching}>
            {searching
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Search className="size-3.5" />}
          </Button>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {searching ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : jiraIssues.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Enter ticket keys or a keyword and press Search.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {jiraIssues.map((issue) => {
                const checked = selected.has(issue.id)
                return (
                  <li
                    key={issue.id}
                    className={`flex items-start gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-accent/50 ${checked ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleIssue(issue.id)}
                  >
                    {/* Checkbox */}
                    <div className={`mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                      {checked && <CheckCircle2 className="size-3 text-primary-foreground" />}
                    </div>

                    {/* Issue details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{issue.key}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">·</span>
                        <span className="text-[10px] text-muted-foreground truncate">{issue.fields.issuetype.name}</span>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2">{issue.fields.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{issue.fields.status.name}</span>
                        {issue.fields.assignee && (
                          <><span>·</span><span>{issue.fields.assignee.displayName}</span></>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="px-5 py-3 shrink-0 border-t border-border flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : 'Select issues to import'}
          </span>
          <div className="flex gap-2">
            {jiraIssues.length > 0 && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setSelected(selected.size === jiraIssues.length
                  ? new Set()
                  : new Set(jiraIssues.map((i) => i.id)))}
              >
                {selected.size === jiraIssues.length ? 'Deselect all' : 'Select all'}
              </Button>
            )}
            <Button
              size="sm" className="h-7 text-xs"
              disabled={selected.size === 0 || importing}
              onClick={handleImport}
            >
              {importing
                ? <><Loader2 className="size-3 mr-1.5 animate-spin" />Importing…</>
                : `Import ${selected.size > 0 ? selected.size : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
