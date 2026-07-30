-- Migration 006: Retro invite link + participants
-- Adds a lazily-generated invite_code to retro_sessions, and a retro_participants
-- table so a retro session has its own membership/identity model instead of
-- relying entirely on team_members (needed for anonymous invite-link joiners).
--
-- EE-156: Anonymous retro invite link with name prompt and session join

-- ──────────────────────────────────────────────────────────────
-- 1. invite_code on retro_sessions
-- ──────────────────────────────────────────────────────────────
-- No DB default: the backend generates a short random code on first request
-- to the invite endpoint (get-or-create) and persists it here.
alter table retro_sessions
  add column if not exists invite_code text unique;

-- ──────────────────────────────────────────────────────────────
-- 2. retro_participants
-- ──────────────────────────────────────────────────────────────
create table if not exists retro_participants (
  id                uuid primary key default uuid_generate_v4(),
  retro_session_id  uuid not null references retro_sessions(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  display_name      text not null,
  is_anonymous      boolean not null default false,
  is_host           boolean not null default false,
  joined_at         timestamptz not null default now(),
  unique (retro_session_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- 3. RLS
-- Backend uses the service role key (bypasses RLS) for all writes.
-- Frontend needs SELECT access via user JWT for Realtime participant sync.
-- ──────────────────────────────────────────────────────────────

-- Helper: is the current user a participant of the given retro session?
create or replace function is_retro_participant(p_retro_session_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from retro_participants
    where retro_session_id = p_retro_session_id and user_id = auth.uid()
  );
$$;

alter table retro_participants enable row level security;

drop policy if exists "participants can view retro participants" on retro_participants;
create policy "participants can view retro participants"
  on retro_participants for select
  using (is_retro_participant(retro_session_id));

-- ──────────────────────────────────────────────────────────────
-- 4. Realtime publication (idempotent)
-- ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'retro_participants'
  ) then
    alter publication supabase_realtime add table retro_participants;
  end if;
end $$;
