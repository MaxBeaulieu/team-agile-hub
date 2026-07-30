'use client'

import type { FloorStats } from './floorTypes'

/** "% of assigned seats" plus the counts that explain it. Derived from the same
 *  seat list the map renders, so the two can never disagree. */
export function FloorStatsBar({ stats }: { stats: FloorStats }) {
  return (
    <div className="fp-stats">
      <div className="fp-stat-hero">
        <strong>{stats.assignedPct}%</strong>
        <span>of seats assigned</span>
      </div>

      <div
        className="fp-meter"
        role="meter"
        aria-valuenow={stats.assignedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of usable seats that are assigned"
      >
        <span style={{ width: `${stats.assignedPct}%` }} />
      </div>

      <dl className="fp-stat-list">
        <div>
          <dt>Assigned</dt>
          <dd>
            {stats.assigned} / {stats.usable}
          </dd>
        </div>
        <div>
          <dt>Permanent</dt>
          <dd>{stats.permanent}</dd>
        </div>
        <div>
          <dt>Floating</dt>
          <dd>{stats.floating}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{stats.available}</dd>
        </div>
        <div>
          <dt>Out of service</dt>
          <dd>{stats.outOfService}</dd>
        </div>
      </dl>
    </div>
  )
}
