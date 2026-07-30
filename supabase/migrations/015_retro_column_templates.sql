-- Migration 015: shared retro column templates (EE-161)
--
-- Retro columns ("Went Well", "Improve", ...) were typed by hand as a
-- comma-separated string every time someone started a retro, in both the
-- sprint retro (/dashboard/retro) and the quick retro (/quickretro) flows.
-- This adds a small library of named column sets that any authenticated user
-- can pick from when creating a retro.
--
-- Templates are global on purpose: they are not team-scoped, so a template
-- saved by one facilitator is reusable by everyone. Built-in templates are
-- seeded here and are read-only; user-created ones can only be edited or
-- deleted by their author (enforced in RetroTemplatesController).

create table if not exists retro_templates (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  columns_json text not null,
  is_builtin   boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists retro_templates_created_by_idx
  on retro_templates (created_by);

-- Built-in starter set. Deterministic ids so re-running the migration is a
-- no-op and so a built-in can never be duplicated.
insert into retro_templates (id, name, columns_json, is_builtin) values
  ('b1000001-0000-0000-0000-000000000001', 'Classic',
   '["Went Well","Improve","Learnings","Questions"]', true),
  ('b1000001-0000-0000-0000-000000000002', 'Start / Stop / Continue',
   '["Start","Stop","Continue"]', true),
  ('b1000001-0000-0000-0000-000000000003', 'Mad / Sad / Glad',
   '["Mad","Sad","Glad"]', true),
  ('b1000001-0000-0000-0000-000000000004', '4 Ls',
   '["Liked","Learned","Lacked","Longed For"]', true),
  ('b1000001-0000-0000-0000-000000000005', 'Sailboat',
   '["Wind (helped us)","Anchors (slowed us)","Rocks (risks)","Island (goal)"]', true),
  ('b1000001-0000-0000-0000-000000000006', 'Keep / Drop / Add',
   '["Keep","Drop","Add"]', true)
on conflict (id) do nothing;

-- Deny-by-default, matching the convention set in 012: the browser never
-- reads this table directly, it goes through the backend API, which uses the
-- service role and bypasses RLS.
alter table retro_templates enable row level security;
