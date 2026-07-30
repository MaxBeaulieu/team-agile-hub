/**
 * All floor geometry in SVG units. 1 metre ~= 56 units.
 * Desks are drawn slightly wider than true scale so names fit; alleys,
 * planters and walls are true to the building.
 */

import type { Facing, PodId } from './floorTypes'

export const VIEW_W = 1240
export const VIEW_H = 720
export const VIEW_BOX = `0 0 ${VIEW_W} ${VIEW_H}`

export const DESK_W = 92
export const DESK_H = 56
export const DESK_GAP = 4
export const SPINE_W = 8

export const BENCH_H = 3 * DESK_H + 2 * DESK_GAP

export interface IslandDef {
  pod: Exclude<PodId, 'HEX'>
  x: number
  y: number
  cols: [number[], number[]]
}

/**
 * Three vertical columns; each column is one continuous bank:
 * bench (3 rows) -> planter -> bench (3 rows) -> planter. No walkway inside a column.
 */
export const ISLANDS: IslandDef[] = [
  { pod: 'A', x: 404, y: 68, cols: [[9, 10, 11], [12, 13, 14]] },
  { pod: 'B', x: 684, y: 68, cols: [[15, 16, 17], [18, 19, 20]] },
  { pod: 'C', x: 964, y: 68, cols: [[21, 22, 23], [24, 25, 26]] },
  { pod: 'D', x: 404, y: 316, cols: [[33, 34, 35], [36, 37, 38]] },
  { pod: 'E', x: 684, y: 316, cols: [[39, 40, 41], [42, 43, 44]] },
  { pod: 'F', x: 964, y: 316, cols: [[45, 46, 47], [48, 49, 50]] },
]

export const PLANTERS = [404, 684, 964].flatMap((x) => [
  { x: x - 8, y: 250, w: 208, h: 60 },
  { x: x - 8, y: 498, w: 208, h: 60 },
])

/**
 * Permanent freestanding whiteboards in the alleys between columns:
 * A|B and B|C on the north bank, D|E and E|F on the south bank.
 */
export const WHITEBOARDS = [
  { x: 640, y1: 84, y2: 228 },
  { x: 920, y1: 84, y2: 228 },
  { x: 640, y1: 332, y2: 476 },
  { x: 920, y1: 332, y2: 476 },
]

/** Rectangular ring of 8 axis-aligned desks. The centre stays open carpet. */
export const HX = 68
export const HY = 84

export const HEX_SEATS: { id: number; x: number; y: number; facing: Facing }[] = [
  { id: 1, x: HX + 30, y: HY, facing: 'N' },
  { id: 2, x: HX + 122, y: HY, facing: 'N' },
  { id: 3, x: HX + 152, y: HY + 60, facing: 'E' },
  { id: 4, x: HX + 152, y: HY + 120, facing: 'E' },
  { id: 5, x: HX + 122, y: HY + 180, facing: 'S' },
  { id: 6, x: HX + 30, y: HY + 180, facing: 'S' },
  { id: 7, x: HX, y: HY + 120, facing: 'W' },
  { id: 8, x: HX, y: HY + 60, facing: 'W' },
]

export const HEX_PLANTS = [
  { x: HX + 122, y: HY + 82 },
  { x: HX + 122, y: HY + 120 },
  { x: HX + 122, y: HY + 158 },
]

/** Static shell layers, drawn behind the desks. */
export const SLAB = { x: 20, y: 20, w: 1200, h: 680 }
export const JOINT_STEP = 112

export const CIRCULATION = [
  { x: 344, y: 38, w: 44, h: 536 },
  { x: 612, y: 38, w: 56, h: 536 },
  { x: 892, y: 38, w: 56, h: 536 },
]
export const MAIN_ALLEY = { x: 20, y: 574, w: 1200, h: 126 }

export const NORTH_WALL = { x: 20, y: 20, w: 1200, h: 18 }
export const WEST_WALL = { x: 20, y: 38, w: 16, h: 342 }
export const EAST_WALL = { x: 1204, y: 38, w: 16, h: 662 }

export const CARPET = { x: 36, y: 52, w: 308, h: 300 }

export const VP_OFFICE = {
  room: { x: 20, y: 380, w: 324, h: 178 },
  desk: { x: 120, y: 512, w: 92, h: 44 },
  chair: { cx: 166, cy: 496, r: 12 },
  door: 'M344 522 A36 36 0 0 1 308 558',
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  rx: number
}

/** Chair glyph on the outer edge of the desk — this is what shows facing. */
export function chairRect(x: number, y: number, facing: Facing): Rect {
  switch (facing) {
    case 'W':
      return { x: x - 16, y: y + 14, width: 12, height: 28, rx: 5 }
    case 'E':
      return { x: x + DESK_W + 4, y: y + 14, width: 12, height: 28, rx: 5 }
    case 'N':
      return { x: x + DESK_W / 2 - 14, y: y - 16, width: 28, height: 12, rx: 5 }
    case 'S':
      return { x: x + DESK_W / 2 - 14, y: y + DESK_H + 4, width: 28, height: 12, rx: 5 }
  }
}

/** Team stripe always sits on the edge opposite the chair, so it reads as "facing inward". */
export function stripeLine(x: number, y: number, facing: Facing) {
  switch (facing) {
    case 'W':
      return { x1: x + DESK_W - 2, y1: y + 5, x2: x + DESK_W - 2, y2: y + DESK_H - 5 }
    case 'E':
      return { x1: x + 2, y1: y + 5, x2: x + 2, y2: y + DESK_H - 5 }
    case 'N':
      return { x1: x + 5, y1: y + DESK_H - 2, x2: x + DESK_W - 5, y2: y + DESK_H - 2 }
    case 'S':
      return { x1: x + 5, y1: y + 2, x2: x + DESK_W - 5, y2: y + 2 }
  }
}

export function islandSeatOrigin(island: IslandDef, col: number, row: number) {
  return {
    x: island.x + col * (DESK_W + SPINE_W),
    y: island.y + row * (DESK_H + DESK_GAP),
  }
}

/** cols[0] faces west, cols[1] faces east. */
export function islandFacing(col: number): Facing {
  return col === 0 ? 'W' : 'E'
}

const POD_BY_SEAT: Record<number, PodId> = {}
HEX_SEATS.forEach((s) => {
  POD_BY_SEAT[s.id] = 'HEX'
})
ISLANDS.forEach((island) => {
  island.cols.flat().forEach((id) => {
    POD_BY_SEAT[id] = island.pod
  })
})

export const podOfSeat = (id: number): PodId => POD_BY_SEAT[id]
