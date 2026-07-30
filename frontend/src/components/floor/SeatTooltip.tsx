'use client'

import { teamColor } from './floorTokens'
import type { Seat } from './floorTypes'
import { isOccupied } from './floorTypes'

function KitLines({ seat }: { seat: Seat }) {
  return (
    <div className="fp-tip-kit">
      <span className={seat.hasDock ? 'is-on' : 'is-off'}>
        <i aria-hidden="true" />
        Docking station · {seat.hasDock ? 'yes' : 'no'}
      </span>
      <span className={seat.hasTerminal ? 'is-on' : 'is-off'}>
        <i aria-hidden="true" />
        Terminal · {seat.hasTerminal ? 'yes' : 'no'}
      </span>
    </div>
  )
}

export function SeatTooltip({ seat, left, top }: { seat: Seat; left: number; top: number }) {
  const occupied = isOccupied(seat)

  return (
    <div className="fp-tip" style={{ left, top }} role="tooltip">
      <div className="fp-tip-n">
        SEAT #{seat.seatNumber} · POD {seat.pod}
      </div>

      {occupied && (
        <>
          <div className="fp-tip-name">{seat.occupantName ?? 'Occupied'}</div>
          <div className="fp-tip-line">
            <i style={{ background: teamColor(seat.occupantTeamId) }} />
            {seat.occupantTeamName ?? 'No team'} · {seat.status}
          </div>
        </>
      )}

      {!occupied && seat.status === 'out_of_service' && (
        <div className="fp-tip-name">Out of service</div>
      )}

      {seat.status === 'available' && <div className="fp-tip-name">Free seat</div>}

      {seat.status !== 'out_of_service' && <KitLines seat={seat} />}

      {seat.note && <div className="fp-tip-note">{seat.note}</div>}

      {seat.openDefectCount > 0 && (
        <div className="fp-tip-warn">
          {seat.openDefectCount} open {seat.openDefectCount === 1 ? 'report' : 'reports'}
        </div>
      )}
    </div>
  )
}
