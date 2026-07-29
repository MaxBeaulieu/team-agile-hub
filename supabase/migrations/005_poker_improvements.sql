-- Migration 005: Poker improvements
-- Adds facilitator_id column + RLS for poker_sessions and poker_tickets
-- poker_votes RLS already exists from migration 001

-- ──────────────────────────────────────────────────────────────
-- 1. Add facilitator_id to poker_sessions
-- ──────────────────────────────────────────────────────────────
alter table poker_sessions
  add column if not exists facilitator_id uuid references auth.users(id);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS for poker_sessions
-- ──────────────────────────────────────────────────────────────
alter table poker_sessions enable row level security;

drop policy if exists "team members can view poker sessions"          on poker_sessions;
drop policy if exists "authenticated users can insert poker sessions" on poker_sessions;
drop policy if exists "facilitator can update poker sessions"         on poker_sessions;

create policy "team members can view poker sessions"
  on poker_sessions for select
  using (is_sprint_member(sprint_id));

create policy "authenticated users can insert poker sessions"
  on poker_sessions for insert
  with check (is_sprint_member(sprint_id));

create policy "facilitator can update poker sessions"
  on poker_sessions for update
  using (facilitator_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 3. RLS for poker_tickets
-- ──────────────────────────────────────────────────────────────
alter table poker_tickets enable row level security;

drop policy if exists "team members can view poker tickets"    on poker_tickets;
drop policy if exists "team members can insert poker tickets"  on poker_tickets;
drop policy if exists "facilitator can update poker tickets"   on poker_tickets;
drop policy if exists "facilitator can delete poker tickets"   on poker_tickets;

create policy "team members can view poker tickets"
  on poker_tickets for select
  using (
    exists (
      select 1 from poker_sessions ps
      where ps.id = poker_session_id
        and is_sprint_member(ps.sprint_id)
    )
  );

create policy "team members can insert poker tickets"
  on poker_tickets for insert
  with check (
    exists (
      select 1 from poker_sessions ps
      where ps.id = poker_session_id
        and is_sprint_member(ps.sprint_id)
    )
  );

create policy "facilitator can update poker tickets"
  on poker_tickets for update
  using (
    exists (
      select 1 from poker_sessions ps
      where ps.id = poker_session_id
        and ps.facilitator_id = auth.uid()
    )
  );

create policy "facilitator can delete poker tickets"
  on poker_tickets for delete
  using (
    exists (
      select 1 from poker_sessions ps
      where ps.id = poker_session_id
        and ps.facilitator_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 4. Enable realtime publication for poker tables (idempotent)
-- ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'poker_sessions'
  ) then
    alter publication supabase_realtime add table poker_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'poker_tickets'
  ) then
    alter publication supabase_realtime add table poker_tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'poker_votes'
  ) then
    alter publication supabase_realtime add table poker_votes;
  end if;
end $$;
