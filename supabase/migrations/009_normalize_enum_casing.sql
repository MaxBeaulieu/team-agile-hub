-- ============================================================
-- 009: Normalize legacy enum casing to lowercase/snake_case
--
-- `001_initial_schema.sql` declared several text "enum" columns with
-- PascalCase check constraints ('Member'/'Admin', 'Planning'/'Active'/...),
-- but the application layer serializes these values as lowercase/snake_case
-- (see backend/Models/*.cs `[EnumMember(Value = "...")]` and the matching
-- TypeScript union types in frontend/src/app/dashboard/**).
--
-- The result was a hard failure on any insert, e.g. creating a team:
--   23514: new row for relation "team_members" violates check constraint
--          "team_members_role_check"
--
-- The newer `003_epics_and_talking_points.sql` already uses lowercase
-- ('on_track','at_risk',...), so lowercase is the project convention and the
-- legacy constraints from 001 are the outlier. This migration brings them
-- in line, backfills any existing rows, and updates the `is_team_admin()`
-- RLS helper (which compared against 'Admin').
--
-- Columns intentionally left alone because app and schema already agree on
-- PascalCase: blockers.status, poker_sessions.deck_type/status,
-- retro_sessions.phase.
--
-- Safe to re-run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- team_members.role: 'Member'/'Admin' -> 'member'/'admin'
-- ──────────────────────────────────────────────────────────────
alter table team_members drop constraint if exists team_members_role_check;
alter table team_members alter column role drop default;

update team_members set role = 'member' where role = 'Member';
update team_members set role = 'admin'  where role = 'Admin';

alter table team_members alter column role set default 'member';
alter table team_members add constraint team_members_role_check
  check (role in ('member', 'admin'));

-- ──────────────────────────────────────────────────────────────
-- sprints.status: 'Planning'/'Active'/'Completed' -> lowercase
-- ──────────────────────────────────────────────────────────────
alter table sprints drop constraint if exists sprints_status_check;
alter table sprints alter column status drop default;

update sprints set status = 'planning'  where status = 'Planning';
update sprints set status = 'active'    where status = 'Active';
update sprints set status = 'completed' where status = 'Completed';

alter table sprints alter column status set default 'planning';
alter table sprints add constraint sprints_status_check
  check (status in ('planning', 'active', 'completed'));

-- ──────────────────────────────────────────────────────────────
-- action_items.type: 'Retro'/'Planning' -> lowercase
-- ──────────────────────────────────────────────────────────────
alter table action_items drop constraint if exists action_items_type_check;

update action_items set type = 'retro'    where type = 'Retro';
update action_items set type = 'planning' where type = 'Planning';

alter table action_items add constraint action_items_type_check
  check (type in ('retro', 'planning'));

-- ──────────────────────────────────────────────────────────────
-- action_items.status: 'Open'/'InProgress'/... -> snake_case
-- ──────────────────────────────────────────────────────────────
alter table action_items drop constraint if exists action_items_status_check;
alter table action_items alter column status drop default;

update action_items set status = 'open'         where status = 'Open';
update action_items set status = 'in_progress'  where status = 'InProgress';
update action_items set status = 'done'         where status = 'Done';
update action_items set status = 'carried_over' where status = 'CarriedOver';
update action_items set status = 'dropped'      where status = 'Dropped';

alter table action_items alter column status set default 'open';
alter table action_items add constraint action_items_status_check
  check (status in ('open', 'in_progress', 'done', 'carried_over', 'dropped'));

-- ──────────────────────────────────────────────────────────────
-- focus_topics.status: 'OnTrack'/'AtRisk'/... -> snake_case
-- ──────────────────────────────────────────────────────────────
alter table focus_topics drop constraint if exists focus_topics_status_check;
alter table focus_topics alter column status drop default;

update focus_topics set status = 'on_track' where status = 'OnTrack';
update focus_topics set status = 'at_risk'  where status = 'AtRisk';
update focus_topics set status = 'on_hold'  where status = 'OnHold';
update focus_topics set status = 'done'     where status = 'Done';

alter table focus_topics alter column status set default 'on_track';
alter table focus_topics add constraint focus_topics_status_check
  check (status in ('on_track', 'at_risk', 'on_hold', 'done'));

-- ──────────────────────────────────────────────────────────────
-- RLS helper: is_team_admin() compared against the old 'Admin' literal.
-- Defined in 001 and redefined in 002 — must be updated here or every
-- admin-gated policy (team_members "team admins can manage members",
-- teams "team admins can update team") silently denies everyone.
-- ──────────────────────────────────────────────────────────────
create or replace function is_team_admin(p_team_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'admin'
  );
$$;
