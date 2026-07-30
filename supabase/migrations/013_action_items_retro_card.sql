-- Migration 013: link retro action items back to the card they came from
--
-- EE-160. Action items created from a card during the Discuss phase were
-- inserted into `action_items` with only a sprint_id, so nothing tied them to
-- the card. The UI had no way to render them back on the card (they appeared
-- to "disappear" after being saved) and the wrap-up summary could not group
-- them per card.

alter table action_items
  add column if not exists retro_card_id uuid references retro_cards(id) on delete cascade;

create index if not exists action_items_retro_card_id_idx
  on action_items (retro_card_id);

-- Realtime so every participant sees an action item appear as it is created
-- (RLS on action_items already restricts rows to the sprint's team members).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'action_items'
  ) then
    alter publication supabase_realtime add table action_items;
  end if;
end $$;
