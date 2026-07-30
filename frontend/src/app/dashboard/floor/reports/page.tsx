'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import '@/components/floor/floor-plan.css'

import { floorApi } from '@/components/floor/floorApi'
import { floorCssVars } from '@/components/floor/floorTokens'
import type { SeatDefectReport } from '@/components/floor/floorTypes'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^API \d+:\s*/, '') : fallback
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function FloorReportsPage() {
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [reports, setReports] = useState<SeatDefectReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const load = useCallback(async (status: 'open' | 'closed') => {
    setLoading(true)
    try {
      setReports(await floorApi.listDefectReports(status))
      setLoadError(null)
    } catch (error) {
      setLoadError(
        errorMessage(error, 'Could not load the reports. Only team admins can see this page.'),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(tab)
  }, [load, tab])

  const copyForSlack = async (report: SeatDefectReport) => {
    try {
      await navigator.clipboard.writeText(report.slackMessage)
      toast.success('Slack message copied.')
    } catch {
      toast.error('Clipboard is not available in this browser.')
    }
  }

  const closeReport = (report: SeatDefectReport) => {
    startTransition(async () => {
      try {
        await floorApi.closeDefectReport(report.id, notes[report.id]?.trim() || null)
        await load(tab)
        toast.success('Report closed.')
      } catch (error) {
        toast.error(errorMessage(error, 'Could not close the report.'))
      }
    })
  }

  return (
    <div className="fp-root" style={floorCssVars as React.CSSProperties}>
      <div className="fp-inner">
        <div className="fp-bar">
          <div className="fp-brand">
            Seat defect reports
            <span>floor 2 — engineering</span>
          </div>

          <span className="fp-lbl">Status</span>
          <div className="fp-seg" role="group" aria-label="Status">
            <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
              Open
            </button>
            <button type="button" aria-pressed={tab === 'closed'} onClick={() => setTab('closed')}>
              Closed
            </button>
          </div>

          <div className="fp-spacer" />

          <Link className="fp-chip" href="/dashboard/floor">
            Back to the floor map
          </Link>
        </div>

        {loadError && <p className="fp-alert">{loadError}</p>}
        {loading && !loadError && <p className="fp-detail-empty">Loading reports…</p>}

        {!loading && !loadError && reports.length === 0 && (
          <p className="fp-detail-empty">Nothing {tab} right now.</p>
        )}

        <div className="fp-reports">
          {reports.map((report) => (
            <article className="fp-report" key={report.id}>
              <header>
                <span className="fp-report-seat">
                  Seat #{report.seatNumber ?? '—'} · Pod {report.pod ?? '—'}
                </span>
                <span className="fp-report-meta">
                  {report.reporterName} · {formatDate(report.createdAt)}
                </span>
              </header>

              <p className="fp-report-reason">{report.reason}</p>

              {report.resolutionNote && (
                <p className="fp-report-res">Resolution: {report.resolutionNote}</p>
              )}

              {report.status === 'open' ? (
                <>
                  <input
                    className="fp-search is-wide"
                    placeholder="Resolution note (optional)"
                    aria-label={`Resolution note for seat ${report.seatNumber ?? ''}`}
                    value={notes[report.id] ?? ''}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                  />
                  <div className="fp-btnrow">
                    <button
                      type="button"
                      className="fp-btn is-primary"
                      disabled={pending}
                      onClick={() => closeReport(report)}
                    >
                      Mark as handled
                    </button>
                    <button
                      type="button"
                      className="fp-btn"
                      onClick={() => void copyForSlack(report)}
                    >
                      Copy for Slack
                    </button>
                  </div>
                </>
              ) : (
                <div className="fp-btnrow">
                  <button type="button" className="fp-btn" onClick={() => void copyForSlack(report)}>
                    Copy for Slack
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
