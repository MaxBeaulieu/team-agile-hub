-- Migration 014: action items for sprint-less quick retros (EE-160)
--
-- 013 tied retro action items to the card they came from. Quick retros
-- (/quickretro, EE-154) have no sprint, but `action_items.sprint_id` was
-- `not null`, so an action item could not be created from a quick retro card
-- at all. Scope an action item to its retro session instead, and keep
-- sprint_id for planning items and legacy sprint retros.

alter table action_items
  alter column sprint_id drop not null;

alter table action_items
  add column if not exists retro_session_id uuid references retro_sessions(id) on delete cascade;

create index if not exists action_items_retro_session_id_idx
  on action_items (retro_session_id);

-- Existing retro action items predate the link; a sprint has at most one retro
-- session, so the session can be recovered from the sprint.
update action_items ai
set retro_session_id = rs.id
from retro_sessions rs
where ai.retro_session_id is null
  and ai.type          = 'retro'
  and ai.sprint_id is not null
  and rs.sprint_id     = ai.sprint_id;

-- Every action item must still hang off something.
alter table action_items drop constraint if exists action_items_scope_check;
alter table action_items add constraint action_items_scope_check
  check (sprint_id is not null or retro_session_id is not null);

-- RLS: sprint items stay team-scoped; sprint-less items are reachable by
-- whoever can see the retro session they belong to (facilitator / team member /
-- invite-link participant). Omitting `with check` makes the same expression
-- apply to inserts and updates.
drop policy if exists "sprint team members can manage action items" on action_items;
drop policy if exists "sprint members or retro owners can manage action items" on action_items;

create policy "sprint members or retro viewers can manage action items"
  on action_items for all using (
    (
      sprint_id is not null
      and exists (select 1 from sprints s where s.id = sprint_id and is_team_member(s.team_id))
    )
    or (
      retro_session_id is not null
      and can_view_retro_session(retro_session_id)
    )
  );
