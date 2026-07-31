'use client'

import { teamColor, tokens } from './floorTokens'
import type { KitLayer } from './floorTypes'

export interface LegendTeam {
  id: string | null
  name: string
}

export function FloorLegend({ kitLayer, teams }: { kitLayer: KitLayer; teams: LegendTeam[] }) {
  const kitWord = kitLayer === 'terminal' ? 'terminal' : 'docking station'

  return (
    <div className="fp-legend">
      <span className="fp-lg">
        <i />
        Assigned
      </span>
      <span className="fp-lg">
        <i className="is-free" />
        Free
      </span>
      <span className="fp-lg">
        <i className="is-oos" />
        Out of service
      </span>
      <span className="fp-lg">
        <span className="fp-lg-lock" aria-hidden="true">
          🔒
        </span>
        Permanent · no lock = floating
      </span>

      {kitLayer !== 'none' && (
        <>
          <span className="fp-lg">
            <svg viewBox="0 0 16 15" width="16" aria-hidden="true">
              <rect x="1" y="2" width="13" height="9" rx="1.5" fill={tokens.ink2} />
            </svg>
            Has {kitWord}
          </span>
          <span className="fp-lg">
            <svg viewBox="0 0 16 15" width="16" aria-hidden="true">
              <rect
                x="1"
                y="2"
                width="13"
                height="9"
                rx="1.5"
                fill="none"
                stroke={tokens.oosEdge}
                strokeWidth="1.2"
              />
              <line x1="0" y1="12" x2="15" y2="1" stroke={tokens.oosEdge} strokeWidth="1.4" />
            </svg>
            No {kitWord}
          </span>
        </>
      )}

      {teams.map((team) => (
        <span className="fp-lg" key={team.id ?? team.name}>
          <i className="is-dot" style={{ background: teamColor(team.id) }} />
          {team.name}
        </span>
      ))}
    </div>
  )
}
