-- Migration 006: Office floor seats
-- One physical floor, edited a few times a year. Seats are seeded from the
-- floor plan geometry; assignment, notes and defect reports are user driven.

-- ──────────────────────────────────────────────────────────────
-- 1. Seats
-- ──────────────────────────────────────────────────────────────
create table if not exists seats (
  id             uuid primary key default uuid_generate_v4(),
  seat_number    integer not null unique,
  pod            text not null check (pod in ('HEX','A','B','C','D','E','F')),
  facing         text not null check (facing in ('N','E','S','W')),
  has_dock       boolean not null default true,
  has_terminal   boolean not null default true,
  out_of_service boolean not null default false,
  note           text,
  occupant_id    uuid references auth.users(id),
  occupant_name  text,
  assignment     text check (assignment in ('permanent','floating')),
  assigned_at    timestamptz,
  updated_at     timestamptz not null default now(),
  -- an occupied seat always carries an assignment type, a free one never does
  constraint seats_assignment_consistency check (
    (occupant_id is null and assignment is null)
    or (occupant_id is not null and assignment is not null)
  )
);

create index if not exists seats_occupant_idx on seats(occupant_id);

-- ──────────────────────────────────────────────────────────────
-- 2. Defect reports
-- ──────────────────────────────────────────────────────────────
create table if not exists seat_defect_reports (
  id              uuid primary key default uuid_generate_v4(),
  seat_id         uuid not null references seats(id) on delete cascade,
  reported_by     uuid not null references auth.users(id),
  reporter_name   text not null default '',
  reason          text not null,
  status          text not null default 'open' check (status in ('open','closed')),
  resolution_note text,
  closed_by       uuid references auth.users(id),
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists seat_defect_reports_status_idx on seat_defect_reports(status);
create index if not exists seat_defect_reports_seat_idx on seat_defect_reports(seat_id);

-- ──────────────────────────────────────────────────────────────
-- 3. RLS — the floor is org-wide, so any signed-in user may read it.
--    All mutations go through the backend (service role), which enforces
--    "occupant or admin" rules the DB has no global role to express.
-- ──────────────────────────────────────────────────────────────
alter table seats enable row level security;

drop policy if exists "authenticated users can view seats" on seats;
create policy "authenticated users can view seats"
  on seats for select to authenticated using (true);

alter table seat_defect_reports enable row level security;

drop policy if exists "authenticated users can view seat defect reports" on seat_defect_reports;
drop policy if exists "users can report seat defects"                    on seat_defect_reports;

create policy "authenticated users can view seat defect reports"
  on seat_defect_reports for select to authenticated using (true);

create policy "users can report seat defects"
  on seat_defect_reports for insert to authenticated
  with check (reported_by = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 4. Seed the 44 physical seats (idempotent).
--    Numbering matches the floor plan: 1–8 hexagon ring, 9–26 north banks,
--    33–50 south banks. Pod D was never cabled for terminals.
-- ──────────────────────────────────────────────────────────────
insert into seats (seat_number, pod, facing, has_dock, has_terminal, out_of_service) values
  ( 1, 'HEX', 'N', true,  true,  false),
  ( 2, 'HEX', 'N', true,  true,  false),
  ( 3, 'HEX', 'E', true,  true,  true ),
  ( 4, 'HEX', 'E', true,  true,  false),
  ( 5, 'HEX', 'S', true,  true,  false),
  ( 6, 'HEX', 'S', true,  true,  false),
  ( 7, 'HEX', 'W', true,  true,  false),
  ( 8, 'HEX', 'W', true,  true,  false),

  ( 9, 'A',   'W', true,  true,  false),
  (10, 'A',   'W', true,  true,  false),
  (11, 'A',   'W', true,  true,  false),
  (12, 'A',   'E', true,  true,  false),
  (13, 'A',   'E', true,  true,  false),
  (14, 'A',   'E', true,  true,  false),

  (15, 'B',   'W', true,  true,  true ),
  (16, 'B',   'W', true,  true,  false),
  (17, 'B',   'W', true,  true,  false),
  (18, 'B',   'E', true,  true,  false),
  (19, 'B',   'E', true,  true,  false),
  (20, 'B',   'E', true,  true,  false),

  (21, 'C',   'W', true,  true,  true ),
  (22, 'C',   'W', true,  true,  false),
  (23, 'C',   'W', true,  true,  false),
  (24, 'C',   'E', true,  true,  false),
  (25, 'C',   'E', true,  true,  false),
  (26, 'C',   'E', true,  true,  false),

  (33, 'D',   'W', true,  false, false),
  (34, 'D',   'W', true,  false, false),
  (35, 'D',   'W', true,  false, false),
  (36, 'D',   'E', true,  false, false),
  (37, 'D',   'E', true,  false, false),
  (38, 'D',   'E', true,  false, false),

  (39, 'E',   'W', true,  true,  false),
  (40, 'E',   'W', true,  true,  false),
  (41, 'E',   'W', true,  true,  false),
  (42, 'E',   'E', false, true,  false),
  (43, 'E',   'E', true,  true,  false),
  (44, 'E',   'E', true,  true,  false),

  (45, 'F',   'W', true,  true,  false),
  (46, 'F',   'W', true,  true,  false),
  (47, 'F',   'W', true,  true,  false),
  (48, 'F',   'E', true,  true,  false),
  (49, 'F',   'E', true,  true,  false),
  (50, 'F',   'E', true,  true,  false)
on conflict (seat_number) do nothing;
