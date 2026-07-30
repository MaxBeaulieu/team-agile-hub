-- Migration 006: Test table
-- Creates a simple test table used to validate the migration pipeline.

create table if not exists test_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists test_items_created_by_idx on test_items(created_by);

alter table test_items enable row level security;

drop policy if exists "authenticated users can view test items"   on test_items;
drop policy if exists "authenticated users can insert test items" on test_items;
drop policy if exists "owner can update test items"               on test_items;
drop policy if exists "owner can delete test items"               on test_items;

create policy "authenticated users can view test items"
  on test_items for select
  using (auth.uid() is not null);

create policy "authenticated users can insert test items"
  on test_items for insert
  with check (created_by = auth.uid());

create policy "owner can update test items"
  on test_items for update
  using (created_by = auth.uid());

create policy "owner can delete test items"
  on test_items for delete
  using (created_by = auth.uid());
