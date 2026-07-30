-- Migration 009: base table grants for anon/authenticated/service_role
--
-- On Supabase Cloud, these grants are provisioned automatically by the
-- platform, so our migrations never needed to set them explicitly. On a
-- local `supabase start` stack (at least the postgres:17.6.1.143 image),
-- freshly-created tables can end up without base SELECT/INSERT/UPDATE/DELETE
-- privileges for anon/authenticated/service_role — only TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN (`Dxtm`) are present. RLS only restricts *rows* once a
-- role already has table-level access, so without this grant every query
-- fails with "permission denied for table ..." (42501), even for
-- service_role, which bypasses RLS but still needs the base grant.
--
-- Safe to (re-)run on both local and hosted projects — GRANT is idempotent.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Apply the same grants to any tables/sequences created by future migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
