import {
  CARPET,
  CIRCULATION,
  EAST_WALL,
  JOINT_STEP,
  MAIN_ALLEY,
  NORTH_WALL,
  PLANTERS,
  SLAB,
  VP_OFFICE,
  WEST_WALL,
  WHITEBOARDS,
} from './floorGeometry'
import { Plant } from './Plant'
import { tokens } from './floorTokens'

function Joints() {
  const lines = []
  for (let x = 132; x < 1220; x += JOINT_STEP) {
    lines.push(<line key={`v${x}`} x1={x} y1={38} x2={x} y2={700} />)
  }
  for (let y = 150; y < 700; y += JOINT_STEP) {
    lines.push(<line key={`h${y}`} x1={36} y1={y} x2={1220} y2={y} />)
  }
  return <g className="fp-joint">{lines}</g>
}

function Planter({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cy = y + h / 2 + 2
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} className="fp-planter" />
      <Plant x={x + w * 0.24} y={cy} scale={0.9} />
      <Plant x={x + w * 0.5} y={cy - 3} />
      <Plant x={x + w * 0.76} y={cy} scale={0.85} />
    </g>
  )
}

/** Slab, joints, circulation, walls, carpet, VP office, planters, whiteboards. */
export function FloorShell() {
  const wallTicks = []
  for (let y = 110; y < WEST_WALL.y + WEST_WALL.h; y += JOINT_STEP) {
    wallTicks.push(<line key={y} x1={22} y1={y} x2={34} y2={y} className="fp-wall-tick" />)
  }

  return (
    <g>
      <defs>
        <pattern
          id="fp-hatch"
          width={7}
          height={7}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width={7} height={7} fill={tokens.oosFill} />
          <line x1={0} y1={0} x2={0} y2={7} stroke={tokens.oosEdge} strokeWidth={2.4} />
        </pattern>
        <pattern id="fp-brick" width={34} height={18} patternUnits="userSpaceOnUse">
          <rect width={34} height={18} fill={tokens.brick} />
          <line x1={0} y1={9} x2={34} y2={9} stroke={tokens.mortar} strokeWidth={1.4} />
          <line x1={17} y1={0} x2={17} y2={9} stroke={tokens.mortar} strokeWidth={1.4} />
          <line x1={0} y1={9} x2={0} y2={18} stroke={tokens.mortar} strokeWidth={1.4} />
        </pattern>
      </defs>

      <rect x={SLAB.x} y={SLAB.y} width={SLAB.w} height={SLAB.h} rx={3} className="fp-floor" />
      <Joints />

      {CIRCULATION.map((c) => (
        <rect key={c.x} x={c.x} y={c.y} width={c.w} height={c.h} className="fp-circ" />
      ))}
      <rect
        x={MAIN_ALLEY.x}
        y={MAIN_ALLEY.y}
        width={MAIN_ALLEY.w}
        height={MAIN_ALLEY.h}
        className="fp-circ"
      />

      <rect
        x={NORTH_WALL.x}
        y={NORTH_WALL.y}
        width={NORTH_WALL.w}
        height={NORTH_WALL.h}
        fill="url(#fp-brick)"
      />

      <rect
        x={WEST_WALL.x}
        y={WEST_WALL.y}
        width={WEST_WALL.w}
        height={WEST_WALL.h}
        className="fp-wall-face"
      />
      {wallTicks}

      <rect
        x={EAST_WALL.x}
        y={EAST_WALL.y}
        width={EAST_WALL.w}
        height={EAST_WALL.h}
        className="fp-wall-east"
      />

      <text x={620} y={648} textAnchor="middle" className="fp-zlabel">
        MAIN ALLEY
      </text>

      <rect
        x={CARPET.x}
        y={CARPET.y}
        width={CARPET.w}
        height={CARPET.h}
        rx={4}
        className="fp-carpet"
      />

      <rect
        x={VP_OFFICE.room.x}
        y={VP_OFFICE.room.y}
        width={VP_OFFICE.room.w}
        height={VP_OFFICE.room.h}
        className="fp-room"
      />
      <path d={VP_OFFICE.door} className="fp-door" />
      <rect
        x={VP_OFFICE.desk.x}
        y={VP_OFFICE.desk.y}
        width={VP_OFFICE.desk.w}
        height={VP_OFFICE.desk.h}
        rx={2}
        className="fp-desk"
      />
      <circle
        cx={VP_OFFICE.chair.cx}
        cy={VP_OFFICE.chair.cy}
        r={VP_OFFICE.chair.r}
        className="fp-chair"
      />
      <text x={38} y={412} className="fp-plabel">
        #51 · VP OFFICE
      </text>
      <text x={38} y={428} className="fp-zlabel">
        not bookable
      </text>

      {PLANTERS.map((p) => (
        <Planter key={`${p.x}-${p.y}`} {...p} />
      ))}

      {WHITEBOARDS.map((b) => (
        <g key={`${b.x}-${b.y1}`}>
          <rect x={b.x - 4} y={b.y1} width={8} height={b.y2 - b.y1} rx={3} className="fp-board" />
          <rect
            x={b.x - 2}
            y={b.y1 + 3}
            width={4}
            height={b.y2 - b.y1 - 6}
            rx={2}
            className="fp-boardface"
          />
        </g>
      ))}
    </g>
  )
}
