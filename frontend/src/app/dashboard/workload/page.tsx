'use client'

import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, AlertTriangle, CheckSquare, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockerStatus = 'Open' | 'InProgress' | 'Resolved'
type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'carried_over' | 'dropped'

type Blocker = {
  id: string
  title: string
  status: BlockerStatus
  jiraIssueId: string | null
}

type ActionItem = {
  id: string
  text: string
  status: ActionItemStatus
  dueDate: string | null
}

type MemberWorkload = {
  userId: string
  displayName: string
  role: string
  blockers: Blocker[]
  actionItems: ActionItem[]
}

type ActiveSprint = {
  id: string
  name: string
  startDate: string
  endDate: string
}

type WorkloadData = {
  team: { id: string; name: string }
  activeSprint: ActiveSprint | null
  members: MemberWorkload[]
}

type JiraIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status: { name: string }
    issuetype: { name: string }
    assignee: { displayName: string; accountId: string } | null
  }
}

type JiraSearchResult = {
  issues: JiraIssue[]
  total: number
}

type Team = { id: string; name: string }

// ─── Status config ────────────────────────────────────────────────────────────

const BLOCKER_STATUS: Record<BlockerStatus, { label: string; cls: string }> = {
  Open:       { label: 'Open',        cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
  InProgress: { label: 'In Progress', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  Resolved:   { label: 'Resolved',    cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
}

const AI_STATUS: Record<ActionItemStatus, { label: string; cls: string }> = {
  open:         { label: 'Open',     cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  in_progress:  { label: 'In Prog',  cls: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  done:         { label: 'Done',     cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
  carried_over: { label: 'Carried',  cls: 'bg-muted text-muted-foreground border-transparent' },
  dropped:      { label: 'Dropped',  cls: 'bg-muted text-muted-foreground border-transparent' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(item: ActionItem) {
  if (!item.dueDate) return false
  if (item.status === 'done' || item.status === 'carried_over' || item.status === 'dropped') return false
  return new Date(item.dueDate) < new Date()
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member }: { member: MemberWorkload }) {
  const hasBlockers = member.blockers.length > 0
  const totalItems  = member.blockers.length + member.actionItems.length

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            hasBlockers ? 'bg-red-500/15 text-red-500' : 'bg-primary/10 text-primary'
          }`}
        >
          {initials(member.displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{member.displayName}</p>
          <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
        </div>
        {totalItems > 0 && (
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            {hasBlockers && (
              <span className="flex items-center gap-0.5 text-red-500 font-medium">
                <AlertTriangle className="size-3" />
                {member.blockers.length}
              </span>
            )}
            {member.actionItems.length > 0 && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <CheckSquare className="size-3" />
                {member.actionItems.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Blockers */}
      {member.blockers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <AlertTriangle className="size-3" /> Blockers
          </p>
          <ul className="flex flex-col gap-1.5">
            {member.blockers.map((b) => (
              <li key={b.id} className="flex items-start gap-2 text-xs">
                <Badge variant="outline" className={`shrink-0 text-[10px] py-0 px-1.5 ${BLOCKER_STATUS[b.status]?.cls}`}>
                  {BLOCKER_STATUS[b.status]?.label}
                </Badge>
                <span className="leading-tight line-clamp-2">{b.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items */}
      {member.actionItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <CheckSquare className="size-3" /> Action Items
          </p>
          <ul className="flex flex-col gap-1.5">
            {member.actionItems.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <Badge variant="outline" className={`shrink-0 text-[10px] py-0 px-1.5 ${AI_STATUS[a.status]?.cls}`}>
                  {AI_STATUS[a.status]?.label}
                </Badge>
                <span className={`leading-tight line-clamp-2 ${isOverdue(a) ? 'text-destructive' : ''}`}>
                  {a.text}
                  {a.dueDate && (
                    <span className="ml-1 text-muted-foreground">· {formatDate(a.dueDate)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalItems === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No open items</p>
      )}
    </div>
  )
}

// ─── Jira Workload Section ────────────────────────────────────────────────────

function JiraWorkloadSection({ teamId }: { teamId: string }) {
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [cloudName, setCloudName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    setLoading(true)
    setError(null)

    api.get<{ connected: boolean; cloudName: string | null }>(`/api/teams/${teamId}/jira/status`)
      .then(({ connected: c, cloudName: cn }) => {
        setConnected(c)
        setCloudName(cn ?? null)
        if (!c) return
        const jql = encodeURIComponent('project = PAT AND sprint in openSprints() AND status not in ("Will Not Do", "Won\'t Do") ORDER BY assignee ASC')
        return api.get<JiraSearchResult>(`/api/teams/${teamId}/jira/issues?jql=${jql}`)
          .then((data) => setIssues(data.issues ?? []))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [teamId])

  if (!loading && !connected) return null

  if (loading) {
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">Jira Sprint Board</h2>
        <p className="text-xs text-muted-foreground">Loading Jira data…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">Jira Sprint Board</h2>
        <p className="text-xs text-destructive">{error}</p>
      </section>
    )
  }

  if (issues.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">Jira Sprint Board</h2>
        <p className="text-xs text-muted-foreground">No open sprint tickets found in the PAT board.</p>
      </section>
    )
  }

  // Group by assignee display name
  const byAssignee: Record<string, JiraIssue[]> = {}
  for (const issue of issues) {
    const name = issue.fields.assignee?.displayName ?? 'Unassigned'
    if (!byAssignee[name]) byAssignee[name] = []
    byAssignee[name].push(issue)
  }
  const filtered = issues

  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">
        Jira Sprint Board
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {filtered.length} issue{filtered.length !== 1 ? 's' : ''} · {Object.keys(byAssignee).length} assignee{Object.keys(byAssignee).length !== 1 ? 's' : ''}
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Object.entries(byAssignee).map(([name, items]) => (
          <div key={name} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
            {/* Assignee header */}
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initials(name)}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {items.length} ticket{items.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Issue list */}
            <ul className="flex flex-col gap-2">
              {items.map((issue) => (
                <li key={issue.id} className="text-xs flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono text-muted-foreground shrink-0">{issue.key}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">
                        {issue.fields.status.name}
                      </Badge>
                    </div>
                    <p className="leading-tight line-clamp-2 text-foreground/80">{issue.fields.summary}</p>
                  </div>
                  {cloudName && (
                    <a
                      href={`https://${cloudName}.atlassian.net/browse/${issue.key}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [workload, setWorkload] = useState<WorkloadData | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingWorkload, setLoadingWorkload] = useState(false)

  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .finally(() => setLoadingTeams(false))
  }, [])

  const loadWorkload = useCallback(async (teamId: string) => {
    setLoadingWorkload(true)
    try {
      const data = await api.get<WorkloadData>(`/api/teams/${teamId}/workload`)
      setWorkload(data)
    } catch (e) {
      console.error('Failed to load workload:', e)
    } finally {
      setLoadingWorkload(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeamId) loadWorkload(selectedTeamId)
    else setWorkload(null)
  }, [selectedTeamId, loadWorkload])

  // Sort members: most open items first
  const sortedMembers = workload?.members.slice().sort((a, b) => {
    const scoreA = a.blockers.length * 2 + a.actionItems.length
    const scoreB = b.blockers.length * 2 + b.actionItems.length
    return scoreB - scoreA
  }) ?? []

  const isLoading = loadingTeams || (!!selectedTeamId && loadingWorkload)

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="text-sm font-semibold shrink-0">Workload Overview</h1>
          {workload?.activeSprint && (
            <span className="text-xs text-muted-foreground truncate">
              · {workload.activeSprint.name}
              {' '}({formatDate(workload.activeSprint.startDate)} – {formatDate(workload.activeSprint.endDate)})
            </span>
          )}
          {workload && !workload.activeSprint && (
            <span className="text-xs text-muted-foreground">· No active sprint</span>
          )}
        </div>
        {teams.length > 1 && (
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="h-8 w-48 text-xs shrink-0">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !selectedTeamId ? (
          <p className="text-sm text-muted-foreground">Select a team to view workload.</p>
        ) : (
          <>
            {/* Team members — internal items */}
            <section>
              <h2 className="text-sm font-semibold mb-3">
                Team Members
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  blockers &amp; action items
                </span>
              </h2>
              {sortedMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {sortedMembers.map((m) => (
                    <MemberCard key={m.userId} member={m} />
                  ))}
                </div>
              )}
            </section>

            {/* Jira sprint board */}
            <JiraWorkloadSection teamId={selectedTeamId} />
          </>
        )}
      </main>
    </>
  )
}
