'use client'

import { HEX_PLANTS, HEX_SEATS } from './floorGeometry'
import { Plant } from './Plant'
import { LayerSeat, type SeatLayer } from './Seat'

/** Rectangular ring of eight axis-aligned desks around open carpet. No table. */
export function HexRing({ layer }: { layer: SeatLayer }) {
  return (
    <g>
      {HEX_PLANTS.map((p) => (
        <Plant key={p.y} x={p.x} y={p.y} scale={0.8} />
      ))}
      {HEX_SEATS.map((s) => (
        <LayerSeat key={s.id} layer={layer} id={s.id} x={s.x} y={s.y} />
      ))}
    </g>
  )
}
