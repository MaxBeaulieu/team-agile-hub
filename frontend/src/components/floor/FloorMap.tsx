'use client'

import { useCallback, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'

import { BenchIsland } from './BenchIsland'
import { FloorShell } from './FloorShell'
import { HexRing } from './HexRing'
import { ISLANDS, VIEW_BOX, VIEW_H, VIEW_MIN_Y, VIEW_W, VP_OFFICE } from './floorGeometry'
import type { ColorBy, KitLayer, SeatMap } from './floorTypes'
import { type SeatLayer } from './Seat'
import { SeatTooltip } from './SeatTooltip'

const TOOLTIP_W = 190

/** The panel lives in the one room nobody can book, so it costs no desk space. */
const VP_PANEL_BOX = {
  left: `${(VP_OFFICE.room.x / VIEW_W) * 100}%`,
  top: `${((VP_OFFICE.room.y - VIEW_MIN_Y) / VIEW_H) * 100}%`,
  width: `${(VP_OFFICE.room.w / VIEW_W) * 100}%`,
  height: `${(VP_OFFICE.room.h / VIEW_H) * 100}%`,
}

export interface FloorMapProps {
  seats: SeatMap
  colorBy: ColorBy
  kitLayer: KitLayer
  highlightedSeat: number | null
  selectedSeat: number | null
  panel?: ReactNode
  onHoverSeat: (seatId: number | null) => void
  onSeatClick: (seatId: number) => void
  onBackgroundClick: () => void
}

export function FloorMap({
  seats,
  colorBy,
  kitLayer,
  highlightedSeat,
  selectedSeat,
  panel,
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
      left: Math.max(0, Math.min(event.clientX - box.left + 14, box.width - TOOLTIP_W)),
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
    isSelected: (id) => id === highlightedSeat || id === selectedSeat,
    onPointerEnter: handleEnter,
    onPointerMove: place,
    onPointerLeave: handleLeave,
    onSelect: onSeatClick,
  }

  const tipSeat = tip ? seats[tip.seatId] : null

  return (
    <div
      className="fp-mapbox"
      style={{ '--fp-plan-ratio': VIEW_W / VIEW_H } as CSSProperties}
      onClick={onBackgroundClick}
    >
      <div className="fp-mapwrap" ref={wrapRef}>
        <svg
          viewBox={VIEW_BOX}
          preserveAspectRatio="none"
          role="group"
          aria-label="Top-down plan of the second floor"
        >
          <FloorShell />
          <HexRing layer={layer} />
          {ISLANDS.map((island) => (
            <BenchIsland key={island.pod} island={island} layer={layer} />
          ))}
        </svg>

        {tip && tipSeat && <SeatTooltip seat={tipSeat} left={tip.left} top={tip.top} />}

        {panel && (
          <div className="fp-vp" style={VP_PANEL_BOX} onClick={(event) => event.stopPropagation()}>
            {panel}
          </div>
        )}
      </div>
    </div>
  )
}
