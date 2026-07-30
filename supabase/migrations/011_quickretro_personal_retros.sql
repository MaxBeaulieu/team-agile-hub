-- Migration 011: QuickRetro personal sessions (EE-154)
-- - Allow sprint-less retro sessions
-- - Add user-facing retro name
-- - Extend retro SELECT policies to creator-owned sessions
--
-- Ordering note: this must run after 008_retro_invite_rls_widen.sql, which
-- rebuilds the retro SELECT policies for invite-link participants (EE-156).
-- Those policies gate on `is_sprint_member(sprint_id) or is_retro_participant(id)`,
-- and neither matches the creator of a sprint-less retro, so the policies are
-- rebuilt here to carry all three conditions:
--   * facilitator  -> creator of a personal quickretro (EE-154)
--   * sprint member -> legacy dashboard retros
--   * participant   -> invite-link joiners (EE-156)

-- 1) Schema changes
alter table retro_sessions
  add column if not exists name text;

update retro_sessions
set name = 'Retro'
where name is null or btrim(name) = '';

alter table retro_sessions
  alter column name set default 'Retro';

alter table retro_sessions
  alter column name set not null;

-- Existing one-retro-per-sprint uniqueness is too strict once sprint becomes optional.
alter table retro_sessions
  drop constraint if exists retro_sessions_sprint_id_key;

-- Keep FK to sprints but make sprint link optional.
alter table retro_sessions
  alter column sprint_id drop not null;

-- 2) Policy helpers
-- search_path is pinned: a SECURITY DEFINER function with a mutable
-- search_path can be hijacked via shadowing objects in a caller-controlled
-- schema.
create or replace function can_view_retro_session(p_retro_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from retro_sessions rs
    where rs.id = p_retro_session_id
      and (
        rs.facilitator_id = auth.uid()
        or (rs.sprint_id is not null and is_sprint_member(rs.sprint_id))
        or is_retro_participant(rs.id)
      )
  );
$$;

-- 3) retro_sessions SELECT policy
alter table retro_sessions enable row level security;

drop policy if exists "team members can view retro sessions" on retro_sessions;
drop policy if exists "team members or participants can view retro sessions" on retro_sessions;

create policy "creators, team members or participants can view retro sessions"
  on retro_sessions for select
  using (
    facilitator_id = auth.uid()
    or (sprint_id is not null and is_sprint_member(sprint_id))
    or is_retro_participant(id)
  );

-- 4) retro_cards policies
alter table retro_cards enable row level security;

drop policy if exists "see revealed or own retro cards" on retro_cards;
drop policy if exists "team members can insert retro cards" on retro_cards;
drop policy if exists "authors can update their retro cards" on retro_cards;

create policy "see revealed or own retro cards"
  on retro_cards for select
  using (
    can_view_retro_session(retro_session_id)
    and (
      is_revealed = true
      or author_id = auth.uid()
      or exists (
        select 1 from retro_sessions rs
        where rs.id = retro_session_id and rs.facilitator_id = auth.uid()
      )
    )
  );

create policy "team members can insert retro cards"
  on retro_cards for insert
  with check (
    author_id = auth.uid()
    and can_view_retro_session(retro_session_id)
  );

create policy "authors can update their retro cards"
  on retro_cards for update
  using (
    author_id = auth.uid()
    and can_view_retro_session(retro_session_id)
  );

-- 5) retro_votes SELECT policy
alter table retro_votes enable row level security;

drop policy if exists "team members can view retro votes" on retro_votes;
drop policy if exists "team members or participants can view retro votes" on retro_votes;

create policy "creators, team members or participants can view retro votes"
  on retro_votes for select
  using (
    exists (
      select 1
      from retro_cards rc
      join retro_sessions rs on rs.id = rc.retro_session_id
      where rc.id = retro_card_id
        and (
          rs.facilitator_id = auth.uid()
          or (rs.sprint_id is not null and is_sprint_member(rs.sprint_id))
          or is_retro_participant(rs.id)
        )
    )
  );

-- 6) mood_checkins SELECT policy
alter table mood_checkins enable row level security;

drop policy if exists "team members can view mood checkins" on mood_checkins;
drop policy if exists "team members or participants can view mood checkins" on mood_checkins;

create policy "creators, team members or participants can view mood checkins"
  on mood_checkins for select
  using (
    exists (
      select 1
      from retro_sessions rs
      where rs.id = retro_session_id
        and (
          rs.facilitator_id = auth.uid()
          or (rs.sprint_id is not null and is_sprint_member(rs.sprint_id))
          or is_retro_participant(rs.id)
        )
    )
  );
