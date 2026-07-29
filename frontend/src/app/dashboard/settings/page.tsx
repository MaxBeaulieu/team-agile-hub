'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Settings, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type JiraStatus = {
  connected: boolean
  cloudName: string | null
}

// ─── Settings content (needs Suspense for useSearchParams) ────────────────────

function SettingsContent() {
  const searchParams   = useSearchParams()
  const router         = useRouter()

  const [teams,          setTeams]          = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [jiraStatus,     setJiraStatus]     = useState<JiraStatus | null>(null)
  const [loadingTeams,   setLoadingTeams]   = useState(true)
  const [loadingJira,    setLoadingJira]    = useState(false)
  const [connecting,     setConnecting]     = useState(false)
  const [disconnecting,  setDisconnecting]  = useState(false)

  // ── Handle OAuth callback query params ───────────────────────────────────
  useEffect(() => {
    const jira    = searchParams.get('jira')
    const msg     = searchParams.get('msg')
    const teamId  = searchParams.get('teamId')

    if (jira === 'connected') {
      toast.success('Jira connected successfully!')
      if (teamId) setSelectedTeamId(teamId)
      // Clean the URL
      router.replace('/dashboard/settings')
    } else if (jira === 'error') {
      toast.error(`Jira connection failed: ${msg ?? 'unknown error'}`)
      router.replace('/dashboard/settings')
    }
  }, [searchParams, router])

  // ── Load teams ────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<Team[]>('/api/teams')
      .then((data) => {
        setTeams(data)
        if (data.length === 1) setSelectedTeamId(data[0].id)
      })
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setLoadingTeams(false))
  }, [])

  // ── Load Jira status when team changes ────────────────────────────────────
  const loadJiraStatus = useCallback(async (teamId: string) => {
    if (!teamId) return
    setLoadingJira(true)
    try {
      const status = await api.get<JiraStatus>(`/api/teams/${teamId}/jira/status`)
      setJiraStatus(status)
    } catch {
      setJiraStatus(null)
    } finally {
      setLoadingJira(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeamId) loadJiraStatus(selectedTeamId)
    else setJiraStatus(null)
  }, [selectedTeamId, loadJiraStatus])

  // ── Connect flow ──────────────────────────────────────────────────────────
  async function handleConnect() {
    if (!selectedTeamId) return
    setConnecting(true)
    try {
      const { url } = await api.get<{ url: string }>(
        `/api/teams/${selectedTeamId}/jira/auth-url`,
      )
      // Full-page redirect to Jira's consent screen
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get Jira auth URL')
      setConnecting(false)
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    if (!selectedTeamId) return
    setDisconnecting(true)
    try {
      await api.delete(`/api/teams/${selectedTeamId}/jira`)
      setJiraStatus({ connected: false, cloudName: null })
      toast.success('Jira disconnected.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect Jira')
    } finally {
      setDisconnecting(false)
    }
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Settings className="size-5 shrink-0" />
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        {loadingTeams ? (
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
        ) : (
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select team…" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!selectedTeamId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a team to view its settings.
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Jira Integration card */}
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    Jira Integration
                    {loadingJira && (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    Connect your Atlassian Jira account to link blockers to Jira issues
                    and import tickets for planning poker.
                  </p>
                </div>

                {!loadingJira && jiraStatus && (
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${
                      jiraStatus.connected
                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                        : 'bg-muted text-muted-foreground border-transparent'
                    }`}
                  >
                    {jiraStatus.connected ? (
                      <><CheckCircle2 className="size-3 mr-1 inline" />Connected</>
                    ) : (
                      <><XCircle className="size-3 mr-1 inline" />Not connected</>
                    )}
                  </Badge>
                )}
              </div>

              {!loadingJira && jiraStatus?.connected && (
                <div className="mt-3 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                  Connected to <span className="font-medium text-foreground">{jiraStatus.cloudName}</span>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                {jiraStatus?.connected ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={disconnecting}
                    onClick={handleDisconnect}
                  >
                    {disconnecting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={connecting || loadingJira}
                    onClick={handleConnect}
                  >
                    {connecting ? (
                      <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Redirecting…</>
                    ) : (
                      <>Connect Jira</>
                    )}
                  </Button>
                )}

                <a
                  href="https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  OAuth docs <ExternalLink className="size-3" />
                </a>
              </div>
            </section>

            {/* Team info card */}
            {selectedTeam && (
              <section className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Team</h2>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Name</span>
                    <span className="font-medium">{selectedTeam.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Members</span>
                    <span>{selectedTeam.team_members.length}</span>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
