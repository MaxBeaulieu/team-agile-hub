/** Shapes returned by `GET /api/seats` and friends. The floor plan renders
 *  geometry from `floorGeometry.ts` and state from these. */

export type Facing = 'N' | 'E' | 'S' | 'W'

export type PodId = 'HEX' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

/** Mirrors the `status` the backend derives for each seat. */
export type SeatStatus = 'available' | 'permanent' | 'floating' | 'out_of_service'

export type SeatAssignment = 'permanent' | 'floating'

export type KitLayer = 'none' | 'terminal' | 'dock'

export type ViewMode = 'plan' | 'roster' | 'print'

export type ColorBy = 'status' | 'team'

export interface Seat {
  id: string
  seatNumber: number
  pod: PodId
  facing: Facing
  hasDock: boolean
  hasTerminal: boolean
  status: SeatStatus
  note: string | null
  occupantId: string | null
  occupantName: string | null
  occupantTeamId: string | null
  occupantTeamName: string | null
  assignedAt: string | null
  isMine: boolean
  openDefectCount: number
}

/** Seats keyed by their printed number, which is what the geometry references. */
export type SeatMap = Record<number, Seat>

export interface SeatDefectReport {
  id: string
  seatId: string
  seatNumber: number | null
  pod: string | null
  reason: string
  reporterName: string
  reportedBy: string
  status: 'open' | 'closed'
  resolutionNote: string | null
  createdAt: string
  closedAt: string | null
  slackMessage: string
}

export interface FloorStats {
  usable: number
  assigned: number
  permanent: number
  floating: number
  available: number
  outOfService: number
  /** Share of usable seats that have an occupant, 0–100. */
  assignedPct: number
}

export function isOccupied(seat: Seat): boolean {
  return seat.status === 'permanent' || seat.status === 'floating'
}

/** Maps the four API states onto the three visual states the CSS knows about. */
export function seatVisual(seat: Seat): 'assigned' | 'free' | 'oos' {
  if (seat.status === 'out_of_service') return 'oos'
  return isOccupied(seat) ? 'assigned' : 'free'
}

export function computeStats(seats: Seat[]): FloorStats {
  const outOfService = seats.filter((s) => s.status === 'out_of_service').length
  const permanent = seats.filter((s) => s.status === 'permanent').length
  const floating = seats.filter((s) => s.status === 'floating').length
  const available = seats.filter((s) => s.status === 'available').length
  const usable = seats.length - outOfService
  const assigned = permanent + floating

  return {
    usable,
    assigned,
    permanent,
    floating,
    available,
    outOfService,
    assignedPct: usable === 0 ? 0 : Math.round((assigned / usable) * 100),
  }
}
