'use client'

import { useState } from 'react'

import { teamColor } from './floorTokens'
import type { Seat, SeatAssignment, SeatKit } from './floorTypes'
import { isOccupied } from './floorTypes'

export interface SeatActionBarProps {
  seat: Seat | null
  isAdmin: boolean
  busy: boolean
  onAssign: (seat: Seat, assignment: SeatAssignment) => void
  onRelease: (seat: Seat) => void
  onUnassign: (seat: Seat) => void
  onReportDefect: (seat: Seat, reason: string) => void
  onToggleEquipment: (seat: Seat, kit: SeatKit, present: boolean) => void
}

const REASON_MAX = 500

const KITS: { kit: SeatKit; label: string; present: (seat: Seat) => boolean }[] = [
  { kit: 'dock', label: 'Dock', present: (seat) => seat.hasDock },
  { kit: 'terminal', label: 'Terminal', present: (seat) => seat.hasTerminal },
]

function KitItem({
  label,
  present,
  editable,
  busy,
  onToggle,
}: {
  label: string
  present: boolean
  editable: boolean
  busy: boolean
  onToggle: () => void
}) {
  const text = `${label} \u00b7 ${present ? 'yes' : 'no'}`

  return (
    <li className={present ? 'is-on' : 'is-off'}>
      {editable ? (
        <button
          type="button"
          className="fp-kit-toggle"
          aria-pressed={present}
          disabled={busy}
          title={`Mark the ${label.toLowerCase()} as ${present ? 'missing' : 'present'}`}
          onClick={onToggle}
        >
          <i aria-hidden="true" />
          {text}
        </button>
      ) : (
        <>
          <i aria-hidden="true" />
          {text}
        </>
      )}
    </li>
  )
}

/** One row tall, above the plan. Remounted by the parent on every selection
 *  change, so a defect draft never leaks from one seat to the next. */
export function SeatActionBar({
  seat,
  isAdmin,
  busy,
  onAssign,
  onRelease,
  onUnassign,
  onReportDefect,
  onToggleEquipment,
}: SeatActionBarProps) {
  const [reason, setReason] = useState('')
  const [reporting, setReporting] = useState(false)

  if (!seat) {
    return (
      <div className="fp-actbar is-empty">
        <span className="fp-act-empty">Pick a desk on the plan to take it or report a defect.</span>
      </div>
    )
  }

  const occupied = isOccupied(seat)
  const outOfService = seat.status === 'out_of_service'
  // Whoever sits there can see the desk; everyone else has to take an admin's word.
  const canEditKit = isAdmin || seat.isMine

  return (
    <div className="fp-actbar">
      <span className="fp-act-seat">
        #{seat.seatNumber} · Pod {seat.pod}
      </span>
      <span className="fp-act-name">
        {occupied ? (seat.occupantName ?? 'Occupied') : outOfService ? 'Out of service' : 'Available'}
      </span>
      {occupied && (
        <span className="fp-act-line">
          <i style={{ background: teamColor(seat.occupantTeamId) }} />
          {seat.occupantTeamName ?? 'No team'} ·{' '}
          {seat.status === 'permanent' ? 'permanent' : 'floating'}
          {seat.isMine && <span className="fp-tag">you</span>}
        </span>
      )}

      <ul className="fp-kit">
        {KITS.map(({ kit, label, present }) => (
          <KitItem
            key={kit}
            label={label}
            present={present(seat)}
            editable={canEditKit}
            busy={busy}
            onToggle={() => onToggleEquipment(seat, kit, !present(seat))}
          />
        ))}
      </ul>

      {seat.openDefectCount > 0 && (
        <span className="fp-act-warn">
          {seat.openDefectCount} open {seat.openDefectCount === 1 ? 'report' : 'reports'}
        </span>
      )}

      <span className="fp-spacer" />

      {!outOfService && seat.status === 'available' && (
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

      {!outOfService && seat.isMine && (
        <div className="fp-btnrow">
          <button type="button" className="fp-btn" disabled={busy} onClick={() => onRelease(seat)}>
            Release
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

      {!outOfService && occupied && !seat.isMine && isAdmin && (
        <button
          type="button"
          className="fp-btn is-danger"
          disabled={busy}
          onClick={() => onUnassign(seat)}
        >
          Unassign {seat.occupantName ?? 'occupant'}
        </button>
      )}

      {!outOfService && occupied && !seat.isMine && !isAdmin && (
        <span className="fp-act-empty">Only an admin can free this desk.</span>
      )}

      {reporting ? (
        <div className="fp-btnrow fp-act-report">
          <input
            className="fp-inp"
            maxLength={REASON_MAX}
            value={reason}
            placeholder="What is broken or missing?"
            aria-label="Defect reason"
            onChange={(event) => setReason(event.target.value)}
          />
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
            Send
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
      ) : (
        <button type="button" className="fp-btn" onClick={() => setReporting(true)}>
          Report a defect
        </button>
      )}
    </div>
  )
}
