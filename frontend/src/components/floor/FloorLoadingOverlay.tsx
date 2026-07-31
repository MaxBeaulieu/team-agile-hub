import type { CSSProperties } from 'react'

import './floor-plan.css'

import { floorCssVars } from './floorTokens'

export function FloorLoadingOverlay({ label = 'Loading the floor' }: { label?: string }) {
  return (
    <div className="fp-loading" role="status" aria-live="polite">
      <div className="fp-loading-card">
        <span className="fp-spinner" aria-hidden="true" />
        <span>{label}…</span>
      </div>
    </div>
  )
}

/** Route-level fallback: `FloorPlanPage` has not mounted yet, so this carries
 *  the tokens and the dashboard-column sizing itself. */
export function FloorLoadingScreen() {
  return (
    <div className="fp-root" style={floorCssVars as CSSProperties}>
      <FloorLoadingOverlay />
    </div>
  )
}
