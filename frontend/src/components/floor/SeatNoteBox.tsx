'use client'

import { useState } from 'react'

import type { Seat } from './floorTypes'

export interface SeatNoteBoxProps {
  seat: Seat | null
  busy: boolean
  onSave: (seat: Seat, note: string | null) => void
}

const NOTE_MAX = 500

/** Fills the VP office footprint on the plan. Remounted by the parent on every
 *  selection change, so a draft never leaks from one seat to the next. */
export function SeatNoteBox({ seat, busy, onSave }: SeatNoteBoxProps) {
  const [draft, setDraft] = useState(seat?.note ?? '')

  if (!seat) {
    return (
      <div className="fp-note">
        <span className="fp-note-mark">Note</span>
        <p className="fp-note-hint">Pick a desk to read or leave its note.</p>
      </div>
    )
  }

  const dirty = (draft.trim() || null) !== (seat.note ?? null)

  return (
    <div className="fp-note">
      <span className="fp-note-mark">Note · #{seat.seatNumber}</span>
      <textarea
        className="fp-note-ta"
        maxLength={NOTE_MAX}
        value={draft}
        placeholder="Anything worth knowing about this desk"
        aria-label={`Note for seat ${seat.seatNumber}`}
        onChange={(event) => setDraft(event.target.value)}
      />
      {dirty && (
        <div className="fp-btnrow">
          <button
            type="button"
            className="fp-btn is-primary"
            disabled={busy}
            onClick={() => onSave(seat, draft.trim() || null)}
          >
            Save
          </button>
          <button type="button" className="fp-btn" onClick={() => setDraft(seat.note ?? '')}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
