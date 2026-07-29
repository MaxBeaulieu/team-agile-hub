-- ============================================================
-- Fix infinite recursion in team_members RLS policies
--
-- The "team admins can manage members" policy (FOR ALL) causes
-- infinite recursion because it directly queries team_members
-- from within a policy on team_members. The SELECT path triggers
-- the policy, which queries the table, which triggers the policy…
--
-- Fix: extract the admin check into a SECURITY DEFINER function
-- (just like is_team_member), which bypasses RLS and breaks the cycle.
-- ============================================================

-- Drop the recursive policy first
drop policy if exists "team admins can manage members" on team_members;

-- Create a security definer function for admin check
create or replace function is_team_admin(p_team_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'Admin'
  );
$$;

-- Recreate the policy using the function (no longer self-referential)
create policy "team admins can manage members"
  on team_members for all using (is_team_admin(team_id));

-- Also fix the teams update policy which directly queries team_members inline
drop policy if exists "team admins can update team" on teams;
create policy "team admins can update team"
  on teams for update using (is_team_admin(id));
