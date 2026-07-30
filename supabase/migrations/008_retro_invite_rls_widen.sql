-- Migration 008: allow retro invite-link participants through RLS
-- 006_retro_invite_participants.sql added retro_participants + is_retro_participant().
-- The SELECT policies added in 004_retro_improvements.sql only check
-- is_sprint_member(), so anonymous/guest invite-link joiners (who aren't on the
-- team) can load initial state via the backend (service role, bypasses RLS)
-- but never receive Supabase Realtime updates, since Realtime is delivered
-- under the requesting user's own JWT and is subject to RLS.
-- This widens those SELECT policies to also allow retro_participants. EE-156.

drop policy if exists "team members can view retro sessions" on retro_sessions;
create policy "team members or participants can view retro sessions"
  on retro_sessions for select
  using (is_sprint_member(sprint_id) or is_retro_participant(id));

drop policy if exists "team members can view retro votes" on retro_votes;
create policy "team members or participants can view retro votes"
  on retro_votes for select
  using (
    exists (
      select 1 from retro_cards rc
      join retro_sessions rs on rs.id = rc.retro_session_id
      where rc.id = retro_card_id
        and (is_sprint_member(rs.sprint_id) or is_retro_participant(rs.id))
    )
  );

drop policy if exists "team members can view mood checkins" on mood_checkins;
create policy "team members or participants can view mood checkins"
  on mood_checkins for select
  using (
    exists (
      select 1 from retro_sessions rs
      where rs.id = retro_session_id
        and (is_sprint_member(rs.sprint_id) or is_retro_participant(rs.id))
    )
  );
