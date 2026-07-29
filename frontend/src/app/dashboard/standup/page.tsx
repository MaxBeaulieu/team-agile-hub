'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Coffee, ChevronDown, ChevronUp, ExternalLink,
  AlertTriangle, Crown, Shuffle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { PickerModal } from './picker-modal'

// ─── Types ────────────────────────────────────────────────────────────────────

type JiraIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status: { name: string; statusCategory: { key: string } }
    issuetype: { name: string }
    assignee: { displayName: string; accountId: string } | null
    updated: string
  }
}

type Blocker = {
  id: string
  title: string
  status: 'Open' | 'InProgress' | 'Resolved'
}

type MemberWorkload = {
  userId: string
  displayName: string
  role: string
  blockers: Blocker[]
  actionItems: unknown[]
}

type WorkloadData = {
  team: { id: string; name: string }
  activeSprint: { id: string; name: string; startDate: string; endDate: string } | null
  members: MemberWorkload[]
}

type Team = { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function daysLeft(endDate: string) {
  const diff = Math.ceil(
    (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (diff <= 0) return 'last day'
  return `${diff}d left`
}

function formatDay() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function wasUpdatedYesterday(updatedIso: string) {
  const updated = new Date(updatedIso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return updated >= yesterday && updated < today
}

// ─── Status pill colours ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'in progress':     'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'done':            'bg-green-500/20 text-green-300 border-green-500/40',
  'to do':           'bg-slate-500/20 text-slate-300 border-slate-500/40',
  'blocked':         'bg-red-500/20 text-red-300 border-red-500/40',
  'pr & demo':       'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'blocked/on-hold': 'bg-red-500/20 text-red-300 border-red-500/40',
}

function statusCls(name: string) {
  return STATUS_COLORS[name.toLowerCase()] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/40'
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  inProgress,
  doneYesterday,
  toDo,
  isPresenter,
  cloudName,
}: {
  member: MemberWorkload
  inProgress: JiraIssue[]
  doneYesterday: JiraIssue[]
  toDo: JiraIssue[]
  isPresenter: boolean
  cloudName: string | null
}) {
  const [expanded, setExpanded] = useState(isPresenter)
  const ref = useRef<HTMLDivElement>(null)

  // auto-scroll into view when made presenter
  useEffect(() => {
    if (isPresenter) {
      setExpanded(true)
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isPresenter])

  const openBlockers = member.blockers.filter((b) => b.status !== 'Resolved')
  const jiraUrl = (key: string) =>
    cloudName ? `https://${cloudName}.atlassian.net/browse/${key}` : null

  return (
    <div
      ref={ref}
      className={`rounded-lg border transition-all ${
        isPresenter
          ? 'border-primary/40 bg-primary/5 shadow-md'
          : 'border-border bg-card'
      }`}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Avatar */}
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            isPresenter
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {initials(member.displayName)}
        </div>

        {/* Name + badges */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{member.displayName}</span>
          {isPresenter && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5 shrink-0">
              <Crown className="size-2.5" /> Presenting
            </span>
          )}
          {openBlockers.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-red-400 shrink-0">
              <AlertTriangle className="size-3" /> {openBlockers.length} blocker{openBlockers.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Ticket counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 mr-2">
          {inProgress.length > 0 && <span className="text-blue-400">{inProgress.length} in prog</span>}
          {doneYesterday.length > 0 && <span className="text-green-400">{doneYesterday.length} done</span>}
          {toDo.length > 0 && <span>{toDo.length} to do</span>}
        </div>

        {expanded ? (
          <ChevronUp className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">

          {/* ✅ What did you work on? */}
          <Section
            label="✅ Working on"
            empty={inProgress.length === 0 ? 'Nothing in progress' : null}
          >
            {inProgress.map((issue) => (
              <IssueRow key={issue.id} issue={issue} jiraUrl={jiraUrl(issue.key)} />
            ))}
          </Section>

          {/* ✅ What did you finish yesterday? */}
          <Section
            label="🎉 Finished yesterday"
            empty={doneYesterday.length === 0 ? 'Nothing completed yesterday' : null}
          >
            {doneYesterday.map((issue) => (
              <IssueRow key={issue.id} issue={issue} jiraUrl={jiraUrl(issue.key)} />
            ))}
          </Section>

          {/* ✅ What's next? */}
          <Section
            label="⏭️ Up next"
            empty={toDo.length === 0 ? 'Nothing in the queue' : null}
          >
            {toDo.map((issue) => (
              <IssueRow key={issue.id} issue={issue} jiraUrl={jiraUrl(issue.key)} />
            ))}
          </Section>

          {/* ✅ Blockers */}
          <Section
            label="🚧 Blockers"
            empty={openBlockers.length === 0 ? 'No blockers 🎉' : null}
          >
            {openBlockers.map((b) => (
              <div key={b.id} className="flex items-start gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] py-0 px-1.5 ${
                    b.status === 'Open'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {b.status === 'InProgress' ? 'In Progress' : b.status}
                </Badge>
                <span className="leading-tight">{b.title}</span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  label,
  empty,
  children,
}: {
  label: string
  empty: string | null
  children?: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground/60 italic">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">{children}</ul>
      )}
    </div>
  )
}

function IssueRow({ issue, jiraUrl }: { issue: JiraIssue; jiraUrl: string | null }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="font-mono text-muted-foreground shrink-0 mt-0.5">{issue.key}</span>
      <Badge variant="outline" className={`shrink-0 text-[10px] py-0 px-1.5 mt-0.5 font-medium ${statusCls(issue.fields.status.name)}`}>
        {issue.fields.status.name}
      </Badge>
      <span className="flex-1 leading-tight line-clamp-2">{issue.fields.summary}</span>
      {jiraUrl && (
        <a
          href={jiraUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </li>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StandupPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [workload, setWorkload] = useState<WorkloadData | null>(null)
  const [allIssues, setAllIssues] = useState<JiraIssue[]>([])
  const [cloudName, setCloudName] = useState<string | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [presenterId, setPresenterId] = useState<string | null>(null)

  // Load teams once
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .finally(() => setLoadingTeams(false))
  }, [])

  // Load workload + Jira data when team changes
  const loadData = useCallback(async (teamId: string) => {
    setLoadingData(true)
    try {
      const [wl, status] = await Promise.all([
        api.get<WorkloadData>(`/api/teams/${teamId}/workload`),
        api.get<{ connected: boolean; cloudName: string | null }>(`/api/teams/${teamId}/jira/status`),
      ])
      setWorkload(wl)
      setCloudName(status.cloudName ?? null)

      if (status.connected) {
        // Single Jira call — fetch all non-"Will Not Do" sprint tickets, partition client-side
        const jql = encodeURIComponent(
          'project = PAT AND sprint in openSprints() AND status not in ("Will Not Do", "Won\'t Do") ORDER BY status ASC',
        )
        const data = await api.get<{ issues: JiraIssue[] }>(
          `/api/teams/${teamId}/jira/issues?jql=${jql}`,
        )
        setAllIssues(data.issues ?? [])
      }
    } catch (e) {
      console.error('Standup load error:', e)
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeamId) loadData(selectedTeamId)
    else { setWorkload(null); setAllIssues([]) }
  }, [selectedTeamId, loadData])

  // Partition Jira issues per assignee accountId
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function issuesFor(accountId: string | null, statusCategory: 'indeterminate' | 'done' | 'new') {
    return allIssues.filter((i) => {
      const matchAssignee = accountId
        ? i.fields.assignee?.accountId === accountId
        : i.fields.assignee === null
      if (!matchAssignee) return false
      const cat = i.fields.status.statusCategory?.key ?? ''
      if (statusCategory === 'indeterminate') return cat === 'indeterminate' // in progress
      if (statusCategory === 'done') {
        if (cat !== 'done') return false
        const upd = new Date(i.fields.updated)
        return upd >= yesterday && upd < today
      }
      if (statusCategory === 'new') return cat === 'new' // to do
      return false
    })
  }

  // Fuzzy-match DB members to Jira assignees by first name
  const memberJiraMap: Record<string, string | null> = {}
  for (const m of workload?.members ?? []) {
    const match = allIssues.find(
      (i) => i.fields.assignee?.displayName?.toLowerCase().includes(m.displayName.split(' ')[0].toLowerCase()),
    )
    memberJiraMap[m.userId] = match?.fields.assignee?.accountId ?? null
  }

  // DB members enriched with their Jira accountId
  const dbMembers = (workload?.members ?? []).map((m) => ({
    ...m,
    accountId: memberJiraMap[m.userId] ?? null,
  }))

  // Jira assignees not already represented by a DB member
  const matchedAccountIds = new Set(dbMembers.map((m) => m.accountId).filter((id): id is string => !!id))
  const jiraOnlyMembers = Array.from(
    new Map(
      allIssues
        .filter((i) => i.fields.assignee && !matchedAccountIds.has(i.fields.assignee.accountId))
        .map((i) => [i.fields.assignee!.accountId, i.fields.assignee!.displayName])
    ).entries()
  ).map(([accountId, displayName]) => ({
    userId: accountId,
    displayName,
    role: '',
    blockers: [] as Blocker[],
    actionItems: [] as unknown[],
    accountId,
  }))

  // Combined list: DB members first, then anyone else with tickets
  const allMembers = [...dbMembers, ...jiraOnlyMembers]

  const activeSprint = workload?.activeSprint
  const isLoading = loadingTeams || (!!selectedTeamId && loadingData)

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Coffee className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="text-sm font-semibold shrink-0">Daily Standup</h1>
          <span className="text-xs text-muted-foreground hidden sm:block">
            {formatDay()}
          </span>
          {activeSprint && (
            <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1.5">
              · <span className="font-medium text-foreground">{activeSprint.name}</span>
              <span className="text-muted-foreground/60">({daysLeft(activeSprint.endDate)})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {teams.length > 1 && (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {allMembers.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => setPickerOpen(true)}
            >
              <Shuffle className="size-3" />
              Pick who shares
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !selectedTeamId ? (
          <p className="text-sm text-muted-foreground">Select a team to start your standup.</p>
        ) : allMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members found.</p>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {allMembers.map((m) => (
              <MemberCard
                key={m.userId}
                member={m}
                inProgress={issuesFor(m.accountId, 'indeterminate')}
                doneYesterday={issuesFor(m.accountId, 'done')}
                toDo={issuesFor(m.accountId, 'new')}
                isPresenter={presenterId === m.userId}
                cloudName={cloudName}
              />
            ))}
          </div>
        )}
      </main>

      {/* Picker modal */}
      {pickerOpen && workload && (
        <PickerModal
          members={allMembers.map((m) => ({ id: m.userId, name: m.displayName }))}
          onPick={(id) => { setPresenterId(id); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
