'use client'

import Link from 'next/link'

import type { ColorBy, KitLayer, ViewMode } from './floorTypes'

interface Option<T> {
  value: T
  label: string
}

const VIEWS: Option<ViewMode>[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'roster', label: 'Plan + roster' },
  { value: 'print', label: 'Print' },
]

const COLORS: Option<ColorBy>[] = [
  { value: 'status', label: 'Status' },
  { value: 'team', label: 'Team' },
]

const KITS: Option<KitLayer>[] = [
  { value: 'none', label: 'Hide' },
  { value: 'terminal', label: 'Terminals' },
  { value: 'dock', label: 'Docking stations' },
]

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="fp-group">
      <span className="fp-lbl">{label}</span>
      <div className="fp-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface FloorToolbarProps {
  view: ViewMode
  onView: (view: ViewMode) => void
  colorBy: ColorBy
  onColorBy: (colorBy: ColorBy) => void
  kitLayer: KitLayer
  onKitLayer: (layer: KitLayer) => void
  isAdmin: boolean
  openReports: number
}

export function FloorToolbar({
  view,
  onView,
  colorBy,
  onColorBy,
  kitLayer,
  onKitLayer,
  isAdmin,
  openReports,
}: FloorToolbarProps) {
  return (
    <div className="fp-bar">
      <div className="fp-brand">
        Floor 2 — engineering
        <span>seat assignment</span>
      </div>

      <div className="fp-groups">
        <Segmented label="View" options={VIEWS} value={view} onChange={onView} />
        <Segmented label="Color" options={COLORS} value={colorBy} onChange={onColorBy} />
        <Segmented label="Equipment" options={KITS} value={kitLayer} onChange={onKitLayer} />
      </div>

      {isAdmin && (
        <Link className="fp-chip" href="/dashboard/floor/reports">
          Defect reports
          {openReports > 0 && <b className="fp-chip-ct">{openReports}</b>}
        </Link>
      )}
    </div>
  )
}
