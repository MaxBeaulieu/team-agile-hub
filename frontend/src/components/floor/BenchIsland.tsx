'use client'

import {
  BENCH_H,
  DESK_GAP,
  DESK_H,
  DESK_W,
  SPINE_W,
  islandSeatOrigin,
  type IslandDef,
} from './floorGeometry'
import { LayerSeat, type SeatLayer } from './Seat'

/**
 * Two columns of three desks back to back across a shared spine,
 * with a monitor-arm tick at each row's vertical centre.
 */
export function BenchIsland({ island, layer }: { island: IslandDef; layer: SeatLayer }) {
  const arms = island.cols[0].map((_, row) => {
    const cy = island.y + row * (DESK_H + DESK_GAP) + DESK_H / 2
    return (
      <line
        key={row}
        x1={island.x + DESK_W + SPINE_W / 2}
        y1={cy - 9}
        x2={island.x + DESK_W + SPINE_W / 2}
        y2={cy + 9}
        className="fp-arm"
      />
    )
  })

  return (
    <g>
      <text x={island.x} y={island.y - 12} className="fp-plabel">
        POD {island.pod}
      </text>
      <rect
        x={island.x + DESK_W}
        y={island.y}
        width={SPINE_W}
        height={BENCH_H}
        className="fp-spine"
      />
      {arms}
      {island.cols.map((col, colIndex) =>
        col.map((id, rowIndex) => {
          const { x, y } = islandSeatOrigin(island, colIndex, rowIndex)
          return <LayerSeat key={id} layer={layer} id={id} x={x} y={y} />
        }),
      )}
    </g>
  )
}
