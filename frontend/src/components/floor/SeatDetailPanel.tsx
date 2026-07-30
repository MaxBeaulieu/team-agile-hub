'use client'

import { useState } from 'react'

import { teamColor } from './floorTokens'
import type { Seat, SeatAssignment } from './floorTypes'
import { isOccupied } from './floorTypes'

export interface SeatDetailPanelProps {
  seat: Seat | null
  isAdmin: boolean
  busy: boolean
  onAssign: (seat: Seat, assignment: SeatAssignment) => void
  onRelease: (seat: Seat) => void
  onUnassign: (seat: Seat) => void
  onSaveNote: (seat: Seat, note: string | null) => void
  onReportDefect: (seat: Seat, reason: string) => void
}

const NOTE_MAX = 500

/** Remounted by the parent on every selection change, so drafts never leak
 *  from one seat to the next. */
export function SeatDetailPanel({
  seat,
  isAdmin,
  busy,
  onAssign,
  onRelease,
  onUnassign,
  onSaveNote,
  onReportDefect,
}: SeatDetailPanelProps) {
  const [noteDraft, setNoteDraft] = useState(seat?.note ?? '')
  const [editingNote, setEditingNote] = useState(false)
  const [reason, setReason] = useState('')
  const [reporting, setReporting] = useState(false)

  if (!seat) {
    return (
      <div className="fp-detail">
        <div className="fp-h3">Seat</div>
        <p className="fp-detail-empty">Pick a desk on the plan to see who sits there.</p>
      </div>
    )
  }

  const occupied = isOccupied(seat)
  const outOfService = seat.status === 'out_of_service'

  return (
    <div className="fp-detail">
      <div className="fp-h3">
        Seat #{seat.seatNumber} · Pod {seat.pod}
      </div>

      <div className="fp-detail-name">
        {occupied
          ? (seat.occupantName ?? 'Occupied')
          : outOfService
            ? 'Out of service'
            : 'Available'}
      </div>

      {occupied && (
        <div className="fp-detail-line">
          <i style={{ background: teamColor(seat.occupantTeamId) }} />
          {seat.occupantTeamName ?? 'No team'} ·{' '}
          {seat.status === 'permanent' ? 'permanent desk' : 'floating desk'}
          {seat.isMine && <span className="fp-tag">you</span>}
        </div>
      )}

      <ul className="fp-detail-kit">
        <li className={seat.hasDock ? '' : 'is-missing'}>
          {seat.hasDock ? 'Docking station' : 'No docking station'}
        </li>
        <li className={seat.hasTerminal ? '' : 'is-missing'}>
          {seat.hasTerminal ? 'Terminal' : 'No terminal'}
        </li>
      </ul>

      {seat.openDefectCount > 0 && (
        <p className="fp-detail-warn">
          {seat.openDefectCount} open defect {seat.openDefectCount === 1 ? 'report' : 'reports'}
        </p>
      )}

      {/* ── note ── */}
      <div className="fp-detail-sec">
        <div className="fp-detail-h">Note</div>
        {editingNote ? (
          <>
            <textarea
              className="fp-ta"
              maxLength={NOTE_MAX}
              value={noteDraft}
              placeholder="Anything worth knowing about this desk"
              aria-label="Seat note"
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <div className="fp-btnrow">
              <button
                type="button"
                className="fp-btn is-primary"
                disabled={busy}
                onClick={() => {
                  onSaveNote(seat, noteDraft.trim() || null)
                  setEditingNote(false)
                }}
              >
                Save note
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => {
                  setNoteDraft(seat.note ?? '')
                  setEditingNote(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={seat.note ? 'fp-detail-note' : 'fp-detail-empty'}>
              {seat.note ?? 'No note yet.'}
            </p>
            <button type="button" className="fp-btn" onClick={() => setEditingNote(true)}>
              {seat.note ? 'Edit note' : 'Add a note'}
            </button>
          </>
        )}
      </div>

      {/* ── assignment ── */}
      {!outOfService && (
        <div className="fp-detail-sec">
          <div className="fp-detail-h">Assignment</div>

          {seat.status === 'available' && (
            <div className="fp-btnrow">
              <button
                type="button"
                className="fp-btn is-primary"
                disabled={busy}
                onClick={() => onAssign(seat, 'permanent')}
              >
                Take permanently
              </button>
              <button
                type="button"
                className="fp-btn"
                disabled={busy}
                onClick={() => onAssign(seat, 'floating')}
              >
                Take as floating
              </button>
            </div>
          )}

          {seat.isMine && (
            <div className="fp-btnrow">
              <button
                type="button"
                className="fp-btn"
                disabled={busy}
                onClick={() => onRelease(seat)}
              >
                Release this seat
              </button>
              <button
                type="button"
                className="fp-btn"
                disabled={busy}
                onClick={() => onAssign(seat, seat.status === 'floating' ? 'permanent' : 'floating')}
              >
                {seat.status === 'floating' ? 'Make permanent' : 'Make floating'}
              </button>
            </div>
          )}

          {occupied && !seat.isMine && isAdmin && (
            <div className="fp-btnrow">
              <button
                type="button"
                className="fp-btn is-danger"
                disabled={busy}
                onClick={() => onUnassign(seat)}
              >
                Unassign {seat.occupantName ?? 'occupant'}
              </button>
            </div>
          )}

          {occupied && !seat.isMine && !isAdmin && (
            <p className="fp-detail-empty">Only an admin can free this desk.</p>
          )}
        </div>
      )}

      {/* ── defect ── */}
      <div className="fp-detail-sec">
        <div className="fp-detail-h">Something wrong with this desk?</div>
        {reporting ? (
          <>
            <textarea
              className="fp-ta"
              maxLength={NOTE_MAX}
              value={reason}
              placeholder="What is broken or missing?"
              aria-label="Defect reason"
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="fp-btnrow">
              <button
                type="button"
                className="fp-btn is-danger"
                disabled={busy || reason.trim().length === 0}
                onClick={() => {
                  onReportDefect(seat, reason.trim())
                  setReason('')
                  setReporting(false)
                }}
              >
                Send report
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => {
                  setReason('')
                  setReporting(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="fp-btn" onClick={() => setReporting(true)}>
            Report a defect
          </button>
        )}
      </div>
    </div>
  )
}
