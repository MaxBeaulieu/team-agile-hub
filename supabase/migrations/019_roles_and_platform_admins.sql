-- Migration 019: two-scope RBAC — platform admins + stricter team-admin gates
--
-- Roles were already half-present: team_members.role is 'member'|'admin' and
-- is_team_admin() exists since 002. What was missing is a *global* scope.
--
-- The floor map (007) has no team at all, so SeatsController approximated an
-- org-wide admin with "is this user an admin of ANY team". Because every user
-- may create a team and is made its admin on creation (TeamsController.CreateTeam),
-- that check was self-grantable: create a throwaway team -> instant floor-map
-- admin, able to unassign anyone's desk and read the whole defect queue.
-- (OWASP A01: broken access control / privilege escalation.)
--
-- This migration introduces the missing scope and tightens the policies that
-- were looser than the product intends:
--
--   platform admin  -> org-wide: floor map, defect queue, seat unassign
--   team admin      -> team-scoped: sprints, integrations, membership, deletion
--   team member     -> participation: ceremonies, blockers, cards, votes
--
-- Backend still connects with the service role and bypasses RLS, so these
-- policies are defence in depth behind the C# checks, not a replacement.

-- ──────────────────────────────────────────────────────────────
-- 1. Platform admins
--
-- Two tables on purpose. The allowlist is keyed by *email* so an admin can be
-- designated before they have ever signed in (auth.users row does not exist
-- yet); platform_admins is keyed by user_id and is what the hot-path helper
-- reads. A trigger keeps the second in sync with the first.
-- ──────────────────────────────────────────────────────────────
create table if not exists platform_admin_allowlist (
  email    text primary key check (email = lower(email)),
  note     text,
  added_at timestamptz not null default now()
);

create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

-- Bootstrap. Add rows here (or insert at runtime) to designate more admins.
insert into platform_admin_allowlist (email, note)
values ('maxime.beaulieu@amilia.com', 'bootstrap admin — migration 019')
on conflict (email) do nothing;

-- Backfill anyone already registered whose email is allowlisted.
insert into platform_admins (user_id)
select u.id
from auth.users u
join platform_admin_allowlist a on lower(a.email) = lower(u.email)
on conflict (user_id) do nothing;

-- Promote allowlisted users who sign up *after* this migration runs.
create or replace function sync_platform_admin_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is not null
     and exists (
       select 1 from platform_admin_allowlist a
       where lower(a.email) = lower(new.email)
     )
  then
    insert into platform_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_platform_admin on auth.users;
create trigger trg_sync_platform_admin
  after insert or update of email on auth.users
  for each row execute function sync_platform_admin_from_allowlist();

-- ──────────────────────────────────────────────────────────────
-- 2. RLS helper — mirrors is_team_member / is_team_admin.
--    security definer so it can read platform_admins from inside a policy.
-- ──────────────────────────────────────────────────────────────
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Privileges. 009 granted base privileges to the three roles and 012
--    revoked them from anon; new tables need the same treatment explicitly
--    because `alter default privileges` only covers the role that set it.
-- ──────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on platform_admins, platform_admin_allowlist to authenticated, service_role;

revoke select, insert, update, delete
  on platform_admins, platform_admin_allowlist from anon;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS on the new tables
--    A user may see whether *they* are a platform admin (the /api/me payload
--    is served by the backend, but Realtime/direct reads should not leak the
--    full roster). The allowlist gets no policy at all: deny-by-default.
-- ──────────────────────────────────────────────────────────────
alter table platform_admins          enable row level security;
alter table platform_admin_allowlist enable row level security;

drop policy if exists "users can see their own platform admin row" on platform_admins;
create policy "users can see their own platform admin row"
  on platform_admins for select to authenticated
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 5. Seats & defect reports — org-wide scope, now expressible in SQL
--
-- The floor stays readable by everyone (people need to find each other), but
-- the defect queue is an admin work list: a reporter sees their own reports,
-- platform admins see all of them.
-- ──────────────────────────────────────────────────────────────
drop policy if exists "platform admins can update seats" on seats;
create policy "platform admins can update seats"
  on seats for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

drop policy if exists "authenticated users can view seat defect reports" on seat_defect_reports;
drop policy if exists "reporters and platform admins can view seat defect reports" on seat_defect_reports;
create policy "reporters and platform admins can view seat defect reports"
  on seat_defect_reports for select to authenticated
  using (reported_by = auth.uid() or is_platform_admin());

drop policy if exists "platform admins can resolve seat defect reports" on seat_defect_reports;
create policy "platform admins can resolve seat defect reports"
  on seat_defect_reports for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- ──────────────────────────────────────────────────────────────
-- 6. Sprints are now an admin artefact
--    Members keep full read access and still participate in every ceremony
--    hung off a sprint; they just cannot create/reshape/delete the sprint.
-- ──────────────────────────────────────────────────────────────
drop policy if exists "team members can create sprints" on sprints;
drop policy if exists "team members can update sprints" on sprints;
drop policy if exists "team admins can create sprints" on sprints;
drop policy if exists "team admins can update sprints" on sprints;
drop policy if exists "team admins can delete sprints" on sprints;

create policy "team admins can create sprints"
  on sprints for insert with check (is_team_admin(team_id));
create policy "team admins can update sprints"
  on sprints for update using (is_team_admin(team_id));
create policy "team admins can delete sprints"
  on sprints for delete using (is_team_admin(team_id));

-- ──────────────────────────────────────────────────────────────
-- 7. Team deletion — 001 gave teams select/insert/update policies but no
--    delete policy, so the new DELETE /api/teams/{id} endpoint has no
--    RLS counterpart. Add one.
-- ──────────────────────────────────────────────────────────────
drop policy if exists "team admins can delete team" on teams;
create policy "team admins can delete team"
  on teams for delete using (is_team_admin(id));

-- PostgREST caches the schema; make the new tables/functions visible.
notify pgrst, 'reload schema';
