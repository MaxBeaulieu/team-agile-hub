'use client'

import { teamColor } from './floorTokens'
import type { Seat } from './floorTypes'
import { isOccupied } from './floorTypes'

export interface RosterPanelProps {
  seats: Seat[]
  highlightedSeat: number | null
  selectedSeat: number | null
  onHoverSeat: (seatId: number | null) => void
  onSeatClick: (seatId: number) => void
}

interface TeamGroup {
  id: string | null
  name: string
  seats: Seat[]
}

function groupByTeam(seats: Seat[]): TeamGroup[] {
  const groups = new Map<string, TeamGroup>()

  for (const seat of seats) {
    if (!isOccupied(seat)) continue
    const key = seat.occupantTeamId ?? '—'
    const group = groups.get(key)
    if (group) {
      group.seats.push(seat)
    } else {
      groups.set(key, {
        id: seat.occupantTeamId,
        name: seat.occupantTeamName ?? 'No team',
        seats: [seat],
      })
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Grouped by team, not by pod — the pod code on each row is how you find the seat. */
export function RosterPanel({
  seats,
  highlightedSeat,
  selectedSeat,
  onHoverSeat,
  onSeatClick,
}: RosterPanelProps) {
  const ordered = [...seats].sort((a, b) => a.seatNumber - b.seatNumber)
  const teams = groupByTeam(ordered)
  const available = ordered.filter((s) => s.status === 'available')
  const outOfService = ordered.filter((s) => s.status === 'out_of_service')

  const seatRow = (seat: Seat) => {
    const occupied = isOccupied(seat)
    const on = highlightedSeat === seat.seatNumber || selectedSeat === seat.seatNumber
    return (
      <button
        key={seat.seatNumber}
        type="button"
        className={`fp-row${occupied ? '' : ' is-empty'}${on ? ' is-on' : ''}`}
        onMouseEnter={() => onHoverSeat(seat.seatNumber)}
        onMouseLeave={() => onHoverSeat(null)}
        onFocus={() => onHoverSeat(seat.seatNumber)}
        onBlur={() => onHoverSeat(null)}
        onClick={() => onSeatClick(seat.seatNumber)}
      >
        <span className="fp-row-n">{seat.seatNumber}</span>
        <span className="fp-row-name">
          {occupied
            ? (seat.occupantName ?? 'Occupied')
            : seat.status === 'out_of_service'
              ? 'Out of service'
              : 'Free'}
        </span>
        {seat.openDefectCount > 0 && <span className="fp-row-warn">!</span>}
        {seat.status === 'floating' && <span className="fp-row-fl">float</span>}
        <span className="fp-row-pod">{seat.pod}</span>
      </button>
    )
  }

  const section = (title: string, rows: Seat[], dot?: string) =>
    rows.length === 0 ? null : (
      <div key={title}>
        <div className="fp-grp">
          {dot && <span className="fp-dot" style={{ background: dot }} />}
          {title}
          <span className="fp-ct">{rows.length}</span>
        </div>
        {rows.map(seatRow)}
      </div>
    )

  return (
    <div className="fp-roster" aria-label="Roster">
      {teams.map((team) => section(team.name, team.seats, teamColor(team.id)))}
      {section('Available seats', available)}
      {section('Out of service', outOfService)}
    </div>
  )
}
