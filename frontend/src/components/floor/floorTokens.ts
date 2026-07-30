/**
 * Single source of truth for every colour on the floor plan.
 * Components must never inline a hex value — they read from here or from the
 * `--fp-*` custom properties emitted by `floorCssVars`.
 */

export const tokens = {
  concrete: '#E4E1DA',
  circulation: '#EFEDE8',
  joint: '#CFCBC1',
  paper: '#FBF9F4',

  birch: '#E7D5B4',
  birchEdge: '#C6A97C',
  spine: '#B99866',

  chair: '#8B8880',
  whiteboard: '#8B8880',
  whiteboardFace: '#FCFBF7',

  carpet: '#7FA3BE',
  carpetEdge: '#5A82A0',

  brick: '#A65C46',
  mortar: '#C9B4A6',

  plantDark: '#5B8248',
  plantLight: '#7FA45F',
  pot: '#B0664A',
  planter: '#DCD7CC',

  ink: '#241F1B',
  ink2: '#6B655C',
  ink3: '#9A9389',
  hairline: '#DAD5CB',

  freeFill: '#E7F0EE',
  freeEdge: '#2E7D74',

  oosFill: '#FBEEE4',
  oosEdge: '#D3762F',
  oosInk: '#9C5A22',

  kitOn: '#3F8A4B',
  kitOff: '#B23A2F',

  /* Seat action bar — a cool slate band so it never reads as part of the
     warm, paper-toned filter toolbar above it. */
  actionBg: '#E6EFF5',
  actionEdge: '#AEC6D6',
  actionAccent: '#1F5C7A',
  actionInk: '#17384A',
  actionInk2: '#4A6E83',
  actionInk3: '#7C97A8',
  actionSurface: '#F8FBFD',

  eastWall: '#E0DCD3',
  office: '#EAE7E0',
  surface: '#FFFFFF',
  surfaceAlt: '#FDFBF6',
} as const

/** Flattened, ink-light palette used by the "Print" view. */
export const printTokens = {
  concrete: '#F7F5EE',
  circulation: '#FCFBF6',
  joint: '#E4E0D6',
  desk: '#FFFFFF',
  deskFree: '#EEF3F2',
  line: '#3D5566',
  carpet: '#7FA0BA',
} as const

export const opacities = {
  chair: 0.42,
  whiteboardBody: 0.5,
  whiteboardFace: 0.85,
  carpet: 0.62,
  spine: 0.5,
  teamFill: 0.2,
} as const

/** Teams come from the database, so their colours are derived rather than
 *  declared. Same id always lands on the same swatch. */
export const teamPalette = [
  '#1C6F63',
  '#6B4FA0',
  '#A9701A',
  '#8E3F63',
  '#3F6389',
  '#59754A',
] as const

export function teamColor(teamId: string | null | undefined): string {
  if (!teamId) return tokens.ink3
  let hash = 0
  for (let i = 0; i < teamId.length; i += 1) {
    hash = (hash * 31 + teamId.charCodeAt(i)) >>> 0
  }
  return teamPalette[hash % teamPalette.length]
}

export const floorCssVars: Record<string, string> = {
  '--fp-concrete': tokens.concrete,
  '--fp-circulation': tokens.circulation,
  '--fp-joint': tokens.joint,
  '--fp-paper': tokens.paper,
  '--fp-birch': tokens.birch,
  '--fp-birch-edge': tokens.birchEdge,
  '--fp-spine': tokens.spine,
  '--fp-chair': tokens.chair,
  '--fp-whiteboard': tokens.whiteboard,
  '--fp-whiteboard-face': tokens.whiteboardFace,
  '--fp-carpet': tokens.carpet,
  '--fp-carpet-edge': tokens.carpetEdge,
  '--fp-brick': tokens.brick,
  '--fp-mortar': tokens.mortar,
  '--fp-ink': tokens.ink,
  '--fp-ink-2': tokens.ink2,
  '--fp-ink-3': tokens.ink3,
  '--fp-hairline': tokens.hairline,
  '--fp-free': tokens.freeFill,
  '--fp-free-edge': tokens.freeEdge,
  '--fp-oos': tokens.oosFill,
  '--fp-oos-edge': tokens.oosEdge,
  '--fp-oos-ink': tokens.oosInk,
  '--fp-kit-on': tokens.kitOn,
  '--fp-kit-off': tokens.kitOff,
  '--fp-act-bg': tokens.actionBg,
  '--fp-act-edge': tokens.actionEdge,
  '--fp-act-accent': tokens.actionAccent,
  '--fp-act-ink': tokens.actionInk,
  '--fp-act-ink-2': tokens.actionInk2,
  '--fp-act-ink-3': tokens.actionInk3,
  '--fp-act-surface': tokens.actionSurface,
  '--fp-east-wall': tokens.eastWall,
  '--fp-office': tokens.office,
  '--fp-planter': tokens.planter,
  '--fp-surface': tokens.surface,
  '--fp-surface-alt': tokens.surfaceAlt,
  '--fp-print-concrete': printTokens.concrete,
  '--fp-print-circulation': printTokens.circulation,
  '--fp-print-joint': printTokens.joint,
  '--fp-print-desk': printTokens.desk,
  '--fp-print-desk-free': printTokens.deskFree,
  '--fp-print-line': printTokens.line,
  '--fp-print-carpet': printTokens.carpet,
  '--fp-op-chair': String(opacities.chair),
  '--fp-op-carpet': String(opacities.carpet),
  '--fp-op-spine': String(opacities.spine),
}
