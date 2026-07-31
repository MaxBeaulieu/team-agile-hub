'use client'

import type { MouseEvent } from 'react'

import { DESK_H, DESK_W, chairRect, stripeLine } from './floorGeometry'
import { opacities, teamColor } from './floorTokens'
import type { ColorBy, KitLayer, Seat as SeatModel } from './floorTypes'
import { isOccupied, seatVisual } from './floorTypes'

const MAX_CHARS = 13

function truncate(part: string) {
  return part.length > MAX_CHARS ? `${part.slice(0, MAX_CHARS - 1)}·` : part
}

function labelLines(seat: SeatModel): string[] {
  const name = seat.occupantName
  if (isOccupied(seat) && name) {
    const cut = name.indexOf(' ')
    if (cut === -1) return [truncate(name)]
    return [truncate(name.slice(0, cut)), truncate(name.slice(cut + 1))]
  }
  return seat.status === 'out_of_service' ? ['Out of', 'service'] : ['Free']
}

function KitGlyph({ x, y, ok, layer }: { x: number; y: number; ok: boolean; layer: 'terminal' | 'dock' }) {
  const gx = x + DESK_W - 22
  const gy = y + 5
  const bodyClass = ok ? 'fp-kit-yes' : 'fp-kit-no'
  const lineClass = ok ? 'fp-kit-yes-line' : 'fp-kit-no'

  return (
    <g>
      {layer === 'terminal' ? (
        <>
          <rect x={gx} y={gy} width={13} height={9} rx={1.5} className={bodyClass} />
          <line x1={gx + 6.5} y1={gy + 9} x2={gx + 6.5} y2={gy + 12} className={lineClass} />
          <line x1={gx + 3} y1={gy + 12} x2={gx + 10} y2={gy + 12} className={lineClass} />
        </>
      ) : (
        <>
          <rect x={gx + 1} y={gy + 4} width={11} height={8} rx={2} className={bodyClass} />
          <line x1={gx + 4} y1={gy + 4} x2={gx + 4} y2={gy} className={lineClass} />
          <line x1={gx + 9} y1={gy + 4} x2={gx + 9} y2={gy} className={lineClass} />
        </>
      )}
      {!ok && (
        <line x1={gx - 1} y1={gy + 13} x2={gx + 14} y2={gy - 1} className="fp-kit-strike" />
      )}
    </g>
  )
}

export interface SeatProps {
  seat: SeatModel
  x: number
  y: number
  colorBy: ColorBy
  kitLayer: KitLayer
  selected: boolean
  onPointerMove: (event: MouseEvent, seatId: number) => void
  onPointerEnter: (event: MouseEvent, seatId: number) => void
  onPointerLeave: () => void
  onSelect: (seatId: number) => void
}

/** The one and only desk renderer — the hexagon ring uses it unchanged. */
export function Seat({
  seat,
  x,
  y,
  colorBy,
  kitLayer,
  selected,
  onPointerMove,
  onPointerEnter,
  onPointerLeave,
  onSelect,
}: SeatProps) {
  const visual = seatVisual(seat)
  const occupied = isOccupied(seat)
  const color = teamColor(seat.occupantTeamId)
  const chair = chairRect(x, y, seat.facing)
  const stripe = stripeLine(x, y, seat.facing)
  const cx = x + DESK_W / 2
  const cy = y + DESK_H / 2
  const lines = labelLines(seat)
  const teamPaint = colorBy === 'team' && occupied

  const describe = occupied
    ? `${seat.occupantName ?? 'occupied'}, ${seat.occupantTeamName ?? 'no team'}, ${seat.status}`
    : seat.status === 'out_of_service'
      ? 'out of service'
      : 'free'

  return (
    <g
      className={[
        'fp-seat',
        `is-${visual}`,
        seat.isMine ? 'is-mine' : '',
        selected ? 'is-sel' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      tabIndex={0}
      role="button"
      aria-label={`Seat ${seat.seatNumber}, pod ${seat.pod}, ${describe}`}
      onMouseEnter={(event) => onPointerEnter(event, seat.seatNumber)}
      onMouseMove={(event) => onPointerMove(event, seat.seatNumber)}
      onMouseLeave={onPointerLeave}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(seat.seatNumber)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(seat.seatNumber)
        }
      }}
    >
      <rect {...chair} className="fp-chair" />

      <rect
        x={x}
        y={y}
        width={DESK_W}
        height={DESK_H}
        rx={3}
        className="fp-desk"
        fill={teamPaint ? color : undefined}
        fillOpacity={teamPaint ? opacities.teamFill : undefined}
        stroke={teamPaint ? color : undefined}
      />

      <text x={x + 6} y={y + 14} className="fp-dnum">
        #{seat.seatNumber}
        {seat.status === 'permanent' && (
          <tspan dx={3} className="fp-dlock" aria-hidden="true">
            🔒
          </tspan>
        )}
      </text>

      {occupied && <line {...stripe} className="fp-stripe" stroke={color} />}

      {lines.length === 1 ? (
        <text x={cx} y={cy + 6} textAnchor="middle" className="fp-dname">
          {lines[0]}
        </text>
      ) : (
        <>
          <text x={cx} y={cy} textAnchor="middle" className="fp-dname">
            {lines[0]}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="fp-dname">
            {lines[1]}
          </text>
        </>
      )}

      {seat.note && <circle cx={x + DESK_W - 8} cy={y + DESK_H - 8} r={3} className="fp-noteflag" />}

      {seat.openDefectCount > 0 && (
        <g className="fp-defect" aria-hidden="true">
          <circle cx={x + 11} cy={y + DESK_H - 11} r={7} />
          <text x={x + 11} y={y + DESK_H - 7.5} textAnchor="middle">
            !
          </text>
        </g>
      )}

      {kitLayer !== 'none' && seat.status !== 'out_of_service' && (
        <KitGlyph
          x={x}
          y={y}
          layer={kitLayer}
          ok={kitLayer === 'terminal' ? seat.hasTerminal : seat.hasDock}
        />
      )}
    </g>
  )
}

/** Everything a seat needs except its identity and position. */
export interface SeatLayer
  extends Pick<
    SeatProps,
    'colorBy' | 'kitLayer' | 'onPointerMove' | 'onPointerEnter' | 'onPointerLeave' | 'onSelect'
  > {
  seats: Record<number, SeatModel>
  isSelected: (seatId: number) => boolean
}

export function LayerSeat({ layer, id, x, y }: { layer: SeatLayer; id: number; x: number; y: number }) {
  const seat = layer.seats[id]
  if (!seat) return null
  return (
    <Seat
      seat={seat}
      x={x}
      y={y}
      colorBy={layer.colorBy}
      kitLayer={layer.kitLayer}
      selected={layer.isSelected(id)}
      onPointerMove={layer.onPointerMove}
      onPointerEnter={layer.onPointerEnter}
      onPointerLeave={layer.onPointerLeave}
      onSelect={layer.onSelect}
    />
  )
}
