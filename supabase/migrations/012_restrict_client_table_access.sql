-- Migration 012: close client access to tables that have no RLS
--
-- 009_grant_base_privileges.sql fixed a real problem (freshly created tables
-- had no base privileges, so even service_role got 42501). But it granted
-- SELECT/INSERT/UPDATE/DELETE on *all* tables in `public` to `anon` and
-- `authenticated`, and RLS only restricts rows on tables where RLS is enabled.
--
-- Five tables were still RLS-less, so they became fully readable and writable
-- with the public anon key that ships in the browser bundle. Verified locally:
--
--   GET /rest/v1/jira_integrations?select=access_token_encrypted
--   apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
--   -> 200 [{"access_token_encrypted":"..."}]
--
-- jira_integrations stores Atlassian OAuth access/refresh tokens, so this was
-- a credential disclosure (OWASP A01: broken access control).
--
-- Fix, in two layers:
--   1. Enable RLS on the remaining tables. None of them are read directly by
--      the browser (the frontend has no supabase `.from(...)` calls; it uses
--      the backend API plus Realtime on retro/poker tables), so no policies
--      are added: deny-by-default. The ASP.NET backend connects with the
--      service role, which bypasses RLS, so server-side access is unaffected.
--   2. Take table privileges away from `anon` entirely. `anon` is only used
--      for unauthenticated auth calls (sign-in/sign-up); even the anonymous
--      invite-link joiner in EE-156 calls signInAnonymously() and therefore
--      acts as `authenticated`, not `anon`.

-- ── 1. Deny-by-default on the tables that never got RLS ───────────────────
alter table icebreakers            enable row level security;
alter table jira_integrations      enable row level security;
alter table recurring_agenda_items enable row level security;
alter table sprint_members         enable row level security;
alter table sprint_trainings       enable row level security;

-- ── 2. anon must not reach application tables ─────────────────────────────
revoke select, insert, update, delete on all tables in schema public from anon;
revoke usage, select on all sequences in schema public from anon;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;

alter default privileges in schema public
  revoke usage, select on sequences from anon;
