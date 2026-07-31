---
name: floor-map
description: 'Work on the office Floor Map — the top-down SVG seating chart at /dashboard/floor, seat assignment (permanent/floating), seat notes, desk defect reports, the admin report queue, and floor stats. Use when touching frontend/src/components/floor/, frontend/src/app/dashboard/floor/, backend/Controllers/SeatsController.cs, backend/Models/Seat.cs, or supabase/migrations/007_seats.sql; or when asked about desks, seats, pods, seating, hot-desking, or who sits where.'
---

# Floor Map

A single scaled, top-down SVG plan of the office with database-backed seat state.
44 desks: a hex ring (seats 1–8) and six bench pods A–F (9–26, 33–50 — the
numbering has real gaps, do not "fix" them).

## Layout of the feature

| Piece | Path |
|---|---|
| UI components, geometry, tokens, CSS | `frontend/src/components/floor/` |
| Page routes | `frontend/src/app/dashboard/floor/` |
| API | `backend/Controllers/SeatsController.cs` |
| Models | `backend/Models/Seat.cs`, `backend/Models/SeatDefectReport.cs` |
| Schema | `supabase/migrations/007_seats.sql` |

`FloorPlanPage.tsx` is the only stateful component; everything else is presentational.
It takes **no props** — it loads seats, teams, and the current user itself.

## Before you start

The `seats` table must exist. Local dev runs Supabase in Docker, so
`npx supabase start` applies every migration automatically and
`npx supabase db reset` re-runs them from scratch. Against a hosted project,
apply the SQL through the dashboard SQL editor or `npx supabase db push`.

If `GET /api/seats` returns `PGRST205 — Could not find the table 'public.seats'`,
the migration has not been applied to whichever database the backend is pointed at.

## Rules that are easy to break

**Geometry is code, state is data.** Desk positions, pod membership, facings, and
seat numbers live in `floorGeometry.ts`. The `seats` table stores only *state* —
occupant, assignment, note, out-of-service, capabilities. The two are joined by
`seat_number`. Rearranging furniture is a code change, not a data change.

**No hex literals in `.tsx` files.** Every colour comes from a `--fp-*` custom
property emitted by `floorCssVars` in `floorTokens.ts`, consumed via
`floor-plan.css`. Adding a colour means adding a token. This is an acceptance
criterion, not a preference — grep for `#` in the floor components to check.

**The map is light-only.** It depicts concrete, birch, and carpet, so it must not
invert with the app theme (`light|dark|purple|midnight`). Do not wire floor
colours to the theme.

**No per-desk transforms, no rotated text.** Facing is expressed by which edge the
chair and spine sit on, not by rotating the desk group. Labels stay horizontal at
every orientation so they remain legible. `HexRing` desks are axis-aligned
despite the name.

**Four API statuses, three visual states.** `SeatStatus` is
`available | permanent | floating | out_of_service`; the CSS only knows
`assigned | free | oos`. Use `seatVisual()` from `floorTypes.ts` to bridge them —
never map the states inline.

**Stats are derived, never stored.** `computeStats()` runs over the same array the
map draws, so the percentage and the picture cannot disagree. Keep it that way.

## Backend conventions

This project has **no EF Core**. `AppDbContext.cs` is a stub. Everything goes
through the supabase-csharp / Postgrest SDK via `SupabaseService.Db`, which uses
the **service-role key and therefore bypasses RLS** — authorization is the
controller's job, not the database's.

**Admin means `team_members.role`.** Values are lowercase `'member'`/`'admin'` —
`001_initial_schema.sql` originally declared them PascalCase and
`010_normalize_enum_casing.sql` corrected that, so old branches, old rows, and
old docs may disagree. Because the casing has moved once already, **do not filter
by the role string in a Postgrest query**. Fetch the memberships and compare
`Role == TeamRole.Admin` in memory, as `SeatsController` and `TeamsController`
do — Newtonsoft parses the enum case-insensitively, so that comparison survives
either convention.

DTOs serialize camelCase (ASP.NET default resolver) with `StringEnumConverter`
registered globally in `Program.cs`, so `EnumMemberAttribute` values are honoured
on the wire.

### Endpoints

| Method | Route | Who |
|---|---|---|
| GET | `/api/seats` | any authenticated |
| POST | `/api/seats/{id}/assign` | any; auto-releases your previous desk |
| POST | `/api/seats/{id}/release` | occupant or admin |
| POST | `/api/seats/{id}/unassign` | admin only |
| PATCH | `/api/seats/{id}/note` | any authenticated |
| PATCH | `/api/seats/{id}/equipment` | any authenticated |
| POST | `/api/seats/{id}/reports` | any authenticated |
| GET | `/api/seats/reports?status=` | admin only |
| POST | `/api/seats/reports/{reportId}/close` | admin only |

Re-assigning a desk you already hold **switches the terms** (permanent ↔ floating)
rather than erroring. Only a no-op re-assign returns 409.

The Slack message for a defect report is built **server-side** and returned as
`slackMessage`; the client only copies it. Keep the formatting in one place.

## Frontend conventions

`@tanstack/react-query` and `zustand` are installed but **unused anywhere in this
codebase**. Do not introduce them here. The house pattern is `'use client'` +
local `type` declarations + `useState`/`useEffect`/`useCallback`/`useTransition` +
the `api` client + `toast` from `sonner`. See
`frontend/src/app/dashboard/blockers/page.tsx` for the canonical example.

All mutations funnel through `FloorPlanPage`'s `run(action, success, failure)`
helper: it wraps the call in `startTransition`, refetches the floor, and toasts.
The server re-derives status and the page refetches — the client never guesses
what the new state is.

`SeatActionBar` (thin row above the plan) and `SeatNoteBox` (docked in the VP
office footprint, positioned from `VP_OFFICE.room`) are both remounted via a
`key` on the selected seat so in-progress note and defect drafts don't leak
between desks.

Fonts (`--fp-font-sans`, `--fp-font-cond`, `--fp-font-mono`) are loaded in
`app/dashboard/floor/layout.tsx` on a wrapper with `display: contents` — it must
stay display-contents or it introduces a box that breaks the dashboard's flex
column.

## Known trade-offs — already decided, don't re-litigate without cause

- **Assignment is read-then-write, not atomic.** Two people claiming the same free
  desk in the same instant can both succeed, last write winning. A conditional
  update (`where occupant_id is null`) is awkward through the Postgrest client and
  was judged the wrong complexity for a 44-desk office.
- **Seat notes are editable by anyone.** Intentional; there is no per-seat
  ownership of that field.
- **`occupant_name` is a snapshot** taken at assign time, but `GET /api/seats`
  re-resolves the label: current `team_members.display_name`, then
  `UserDirectoryService` (Supabase Auth `user_metadata.full_name`, cached 15 min)
  for occupants who are on no team, then the stored column. There is no profiles
  table, so those two sources are all there is.

## Verification

```powershell
cd backend;  dotnet build
cd frontend; npx tsc --noEmit
cd frontend; npx eslint src/components/floor src/app/dashboard/floor
cd frontend; npm run build
```

`src` has pre-existing lint errors in `blockers/page.tsx` and
`standup/picker-modal.tsx` — scope eslint to the floor paths to get a clean signal.

The shell is **PowerShell 5.1**: `??` is a parse error, use `if/else`.
