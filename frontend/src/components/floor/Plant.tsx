import { tokens } from './floorTokens'

/** Shared greenery glyph — used by the six planters and the hexagon ring only. */
export function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = scale
  return (
    <g>
      <rect
        x={x - 11 * s}
        y={y + 3 * s}
        width={22 * s}
        height={14 * s}
        rx={2}
        fill={tokens.pot}
      />
      <circle cx={x - 7 * s} cy={y - 2 * s} r={8 * s} fill={tokens.plantLight} />
      <circle cx={x + 7 * s} cy={y - 1 * s} r={7 * s} fill={tokens.plantLight} />
      <circle cx={x} cy={y - 9 * s} r={9 * s} fill={tokens.plantDark} />
    </g>
  )
}
