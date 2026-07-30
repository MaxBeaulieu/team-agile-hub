'use client'

import { useCallback, useRef, useState, type MouseEvent } from 'react'

import { BenchIsland } from './BenchIsland'
import { FloorShell } from './FloorShell'
import { HexRing } from './HexRing'
import { ISLANDS, VIEW_BOX } from './floorGeometry'
import type { ColorBy, KitLayer, SeatMap } from './floorTypes'
import { type SeatLayer } from './Seat'
import { SeatTooltip } from './SeatTooltip'

const TOOLTIP_W = 190

export interface FloorMapProps {
  seats: SeatMap
  colorBy: ColorBy
  kitLayer: KitLayer
  isDimmed: (seatId: number) => boolean
  highlightedSeat: number | null
  selectedSeat: number | null
  onHoverSeat: (seatId: number | null) => void
  onSeatClick: (seatId: number) => void
  onBackgroundClick: () => void
}

export function FloorMap({
  seats,
  colorBy,
  kitLayer,
  isDimmed,
  highlightedSeat,
  selectedSeat,
  onHoverSeat,
  onSeatClick,
  onBackgroundClick,
}: FloorMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ seatId: number; left: number; top: number } | null>(null)

  const place = useCallback((event: MouseEvent, seatId: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setTip({
      seatId,
      left: Math.min(event.clientX - box.left + 14, box.width - TOOLTIP_W),
      top: event.clientY - box.top - 10,
    })
  }, [])

  const handleEnter = useCallback(
    (event: MouseEvent, seatId: number) => {
      place(event, seatId)
      onHoverSeat(seatId)
    },
    [place, onHoverSeat],
  )

  const handleLeave = useCallback(() => {
    setTip(null)
    onHoverSeat(null)
  }, [onHoverSeat])

  const layer: SeatLayer = {
    seats,
    colorBy,
    kitLayer,
    isDimmed,
    isSelected: (id) => id === highlightedSeat || id === selectedSeat,
    onPointerEnter: handleEnter,
    onPointerMove: place,
    onPointerLeave: handleLeave,
    onSelect: onSeatClick,
  }

  const tipSeat = tip ? seats[tip.seatId] : null

  return (
    <div className="fp-mapwrap" ref={wrapRef} onClick={onBackgroundClick}>
      <svg viewBox={VIEW_BOX} role="group" aria-label="Top-down plan of the second floor">
        <FloorShell />
        <HexRing layer={layer} />
        {ISLANDS.map((island) => (
          <BenchIsland key={island.pod} island={island} layer={layer} />
        ))}
      </svg>

      {tip && tipSeat && <SeatTooltip seat={tipSeat} left={tip.left} top={tip.top} />}
    </div>
  )
}
