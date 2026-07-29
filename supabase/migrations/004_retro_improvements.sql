-- ============================================================
-- Retro Improvements: facilitator tracking, is_discussed flag, RLS
-- ============================================================

-- Explicit facilitator — previously inferred, now stored
alter table retro_sessions
  add column if not exists facilitator_id uuid references auth.users(id);

-- Track which cards have been discussed in the Discuss phase
alter table retro_cards
  add column if not exists is_discussed boolean not null default false;

-- ──────────────────────────────────────────────────────────────
-- RLS for retro tables (Supabase Realtime needs SELECT policies)
-- Backend uses service role key (bypasses RLS) for all writes.
-- Frontend needs SELECT access via anon+user JWT for Realtime.
-- ──────────────────────────────────────────────────────────────

-- Helper: is the current user a member of the sprint's team?
create or replace function is_sprint_member(p_sprint_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from sprints s
    join team_members tm on tm.team_id = s.team_id
    where s.id = p_sprint_id and tm.user_id = auth.uid()
  );
$$;

-- retro_sessions: team members can read
alter table retro_sessions enable row level security;

create policy "team members can view retro sessions"
  on retro_sessions for select
  using (is_sprint_member(sprint_id));

-- retro_votes: team members can read (via card → session → sprint)
alter table retro_votes enable row level security;

create policy "team members can view retro votes"
  on retro_votes for select
  using (
    exists (
      select 1 from retro_cards rc
      join retro_sessions rs on rs.id = rc.retro_session_id
      where rc.id = retro_card_id
        and is_sprint_member(rs.sprint_id)
    )
  );

-- mood_checkins: team members can read
alter table mood_checkins enable row level security;

create policy "team members can view mood checkins"
  on mood_checkins for select
  using (
    exists (
      select 1 from retro_sessions rs
      where rs.id = retro_session_id
        and is_sprint_member(rs.sprint_id)
    )
  );
