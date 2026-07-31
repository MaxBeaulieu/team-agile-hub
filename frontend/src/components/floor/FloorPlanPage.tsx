'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import './floor-plan.css'

import { useMe } from '@/components/providers/auth-provider'
import { canAdminFloor } from '@/lib/permissions'

import { FloorLegend, type LegendTeam } from './FloorLegend'
import { FloorMap } from './FloorMap'
import { FloorStatsBar } from './FloorStatsBar'
import { FloorToolbar } from './FloorToolbar'
import { RosterPanel } from './RosterPanel'
import { SeatActionBar } from './SeatActionBar'
import { SeatNoteBox } from './SeatNoteBox'
import { floorApi } from './floorApi'
import { floorCssVars } from './floorTokens'
import type {
  ColorBy,
  KitLayer,
  Seat,
  SeatAssignment,
  SeatKit,
  SeatMap,
  ViewMode,
} from './floorTypes'
import { computeStats, isOccupied } from './floorTypes'

function toMap(seats: Seat[]): SeatMap {
  return Object.fromEntries(seats.map((seat) => [seat.seatNumber, seat]))
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^API \d+:\s*/, '') : fallback
}

export function FloorPlanPage() {
  const { me } = useMe()
  // The floor belongs to no team, so it is governed by the org-wide scope.
  // (This used to be "admin of any team", which any user could self-grant by
  // creating a throwaway team and becoming its admin.)
  const isAdmin = canAdminFloor(me)

  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [view, setView] = useState<ViewMode>('plan')
  const [colorBy, setColorBy] = useState<ColorBy>('status')
  const [kitLayer, setKitLayer] = useState<KitLayer>('none')
  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null)
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const next = await floorApi.listSeats()
    setSeats(next)
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const seatList = await floorApi.listSeats()
        if (cancelled) return

        setSeats(seatList)
        setLoadError(null)
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load the floor.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSeat(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const seatMap = useMemo(() => toMap(seats), [seats])
  const stats = useMemo(() => computeStats(seats), [seats])
  const openReports = useMemo(
    () => seats.reduce((total, seat) => total + seat.openDefectCount, 0),
    [seats],
  )

  const legendTeams = useMemo<LegendTeam[]>(() => {
    const byId = new Map<string, LegendTeam>()
    for (const seat of seats) {
      if (!isOccupied(seat)) continue
      const key = seat.occupantTeamId ?? '—'
      if (!byId.has(key)) {
        byId.set(key, { id: seat.occupantTeamId, name: seat.occupantTeamName ?? 'No team' })
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [seats])

  const run = useCallback(
    (action: () => Promise<unknown>, success: string, failure: string) => {
      startTransition(async () => {
        try {
          await action()
          await refresh()
          toast.success(success)
        } catch (error) {
          toast.error(errorMessage(error, failure))
        }
      })
    },
    [refresh],
  )

  const handleAssign = useCallback(
    (seat: Seat, assignment: SeatAssignment) =>
      run(
        () => floorApi.assign(seat.id, assignment),
        `Seat #${seat.seatNumber} is yours (${assignment}).`,
        'Could not take that seat.',
      ),
    [run],
  )

  const handleRelease = useCallback(
    (seat: Seat) =>
      run(
        () => floorApi.release(seat.id),
        `Seat #${seat.seatNumber} released.`,
        'Could not release that seat.',
      ),
    [run],
  )

  const handleUnassign = useCallback(
    (seat: Seat) =>
      run(
        () => floorApi.unassign(seat.id),
        `Seat #${seat.seatNumber} is free again.`,
        'Could not unassign that seat.',
      ),
    [run],
  )

  const handleSaveNote = useCallback(
    (seat: Seat, note: string | null) =>
      run(() => floorApi.updateNote(seat.id, note), 'Note saved.', 'Could not save the note.'),
    [run],
  )

  const handleReportDefect = useCallback(
    (seat: Seat, reason: string) =>
      run(
        () => floorApi.reportDefect(seat.id, reason),
        'Report sent to the admins.',
        'Could not send the report.',
      ),
    [run],
  )

  const handleToggleEquipment = useCallback(
    (seat: Seat, kit: SeatKit, present: boolean) =>
      run(
        () => floorApi.updateEquipment(seat.id, kit, present),
        `Seat #${seat.seatNumber}: ${kit} marked as ${present ? 'present' : 'missing'}.`,
        'Could not update the equipment.',
      ),
    [run],
  )

  const handleSeatClick = useCallback(
    (seatNumber: number) => setSelectedSeat((current) => (current === seatNumber ? null : seatNumber)),
    [],
  )

  const selected = selectedSeat === null ? null : (seatMap[selectedSeat] ?? null)

  return (
    <div
      className={`fp-root fp--${view}`}
      style={floorCssVars as React.CSSProperties}
    >
      <div className="fp-scroll">
        <div className="fp-inner">
          <FloorToolbar
            view={view}
            onView={setView}
            colorBy={colorBy}
            onColorBy={setColorBy}
            kitLayer={kitLayer}
            onKitLayer={setKitLayer}
            isAdmin={isAdmin}
            openReports={openReports}
          />

          {loadError && <p className="fp-alert">{loadError}</p>}
          {loading && !loadError && <p className="fp-detail-empty">Loading the floor…</p>}

          {view !== 'print' && (
            <SeatActionBar
              key={selected?.id ?? 'none'}
              seat={selected}
              isAdmin={isAdmin}
              busy={pending}
              onAssign={handleAssign}
              onRelease={handleRelease}
              onUnassign={handleUnassign}
              onReportDefect={handleReportDefect}
              onToggleEquipment={handleToggleEquipment}
            />
          )}

          <div className="fp-stage">
            <FloorMap
              seats={seatMap}
              colorBy={colorBy}
              kitLayer={kitLayer}
              highlightedSeat={hoveredSeat}
              selectedSeat={selectedSeat}
              onHoverSeat={setHoveredSeat}
              onSeatClick={handleSeatClick}
              onBackgroundClick={() => setSelectedSeat(null)}
              panel={
                view === 'print' ? null : (
                  <SeatNoteBox
                    key={selected?.id ?? 'none'}
                    seat={selected}
                    busy={pending}
                    onSave={handleSaveNote}
                  />
                )
              }
            />

            {view === 'roster' && (
              <aside className="fp-aside">
                <RosterPanel
                  seats={seats}
                  highlightedSeat={hoveredSeat}
                  selectedSeat={selectedSeat}
                  onHoverSeat={setHoveredSeat}
                  onSeatClick={handleSeatClick}
                />
              </aside>
            )}
          </div>

          <FloorLegend kitLayer={kitLayer} teams={legendTeams} />

          <FloorStatsBar stats={stats} />
        </div>
      </div>
    </div>
  )
}
