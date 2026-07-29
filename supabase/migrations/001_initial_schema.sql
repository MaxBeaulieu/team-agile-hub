-- ============================================================
-- Team Agile Hub — Initial Supabase Migration
-- Run this in your Supabase SQL editor or via the CLI:
--   supabase db push
-- ============================================================

-- Enable UUID extension (already available in Supabase)
create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- TEAMS
-- ──────────────────────────────────────────────────────────────
create table if not exists teams (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null check (char_length(name) <= 100),
  sprint_term  text not null default 'Sprint' check (char_length(sprint_term) <= 30),
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

create table if not exists team_members (
  id           uuid primary key default uuid_generate_v4(),
  team_id      uuid not null references teams(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  display_name text not null default '',
  avatar_url   text,
  role         text not null default 'Member' check (role in ('Member', 'Admin')),
  joined_at    timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- SPRINTS
-- ──────────────────────────────────────────────────────────────
create table if not exists sprints (
  id             uuid primary key default uuid_generate_v4(),
  team_id        uuid not null references teams(id) on delete cascade,
  name           text not null,
  goal           text,
  previous_goal  text,
  champion_id    uuid references auth.users(id),
  start_date     timestamptz not null,
  end_date       timestamptz not null,
  status         text not null default 'Planning' check (status in ('Planning','Active','Completed')),
  created_at     timestamptz not null default now()
);

create table if not exists sprint_members (
  id             uuid primary key default uuid_generate_v4(),
  sprint_id      uuid not null references sprints(id) on delete cascade,
  user_id        uuid not null references auth.users(id),
  days_off       text,
  capacity_score int check (capacity_score between 1 and 10),
  unique (sprint_id, user_id)
);

create table if not exists sprint_trainings (
  id          uuid primary key default uuid_generate_v4(),
  sprint_id   uuid not null references sprints(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  description text not null,
  unique (sprint_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- RETRO
-- ──────────────────────────────────────────────────────────────
create table if not exists retro_sessions (
  id                       uuid primary key default uuid_generate_v4(),
  sprint_id                uuid not null references sprints(id) on delete cascade unique,
  phase                    text not null default 'CheckIn',
  columns_json             text not null default '["Went Well","Improve","Action Items"]',
  vote_count               int not null default 5,
  hide_votes_until_revealed boolean not null default false,
  current_speaker_id       uuid,
  speaker_order_json       text,
  icebreaker_question      text,
  active_discussion_card_id uuid,
  created_at               timestamptz not null default now()
);

create table if not exists retro_cards (
  id                uuid primary key default uuid_generate_v4(),
  retro_session_id  uuid not null references retro_sessions(id) on delete cascade,
  author_id         uuid not null references auth.users(id),
  "column"          text not null,
  content           text not null,
  group_id          uuid,
  group_label       text,
  discussion_notes  text,
  is_revealed       boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists retro_votes (
  id             uuid primary key default uuid_generate_v4(),
  retro_card_id  uuid not null references retro_cards(id) on delete cascade,
  user_id        uuid not null references auth.users(id),
  count          int not null default 1,
  unique (retro_card_id, user_id)
);

create table if not exists mood_checkins (
  id               uuid primary key default uuid_generate_v4(),
  retro_session_id uuid not null references retro_sessions(id) on delete cascade,
  user_id          uuid not null references auth.users(id),
  entry_mood       int check (entry_mood between 1 and 5),
  exit_mood        int check (exit_mood between 1 and 5),
  unique (retro_session_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- POKER
-- ──────────────────────────────────────────────────────────────
create table if not exists poker_sessions (
  id                uuid primary key default uuid_generate_v4(),
  sprint_id         uuid not null references sprints(id) on delete cascade unique,
  deck_type         text not null default 'Fibonacci' check (deck_type in ('Fibonacci','TShirt','Custom')),
  custom_deck_json  text,
  status            text not null default 'Pending' check (status in ('Pending','InProgress','Completed')),
  current_ticket_id uuid,
  created_at        timestamptz not null default now()
);

create table if not exists poker_tickets (
  id               uuid primary key default uuid_generate_v4(),
  poker_session_id uuid not null references poker_sessions(id) on delete cascade,
  jira_issue_id    text,
  title            text not null,
  description      text,
  final_points     int,
  votes_revealed   boolean not null default false,
  "order"          int not null default 0
);

create table if not exists poker_votes (
  id              uuid primary key default uuid_generate_v4(),
  poker_ticket_id uuid not null references poker_tickets(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  estimate        text not null,
  revealed_at     timestamptz,
  unique (poker_ticket_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- ACTION ITEMS
-- ──────────────────────────────────────────────────────────────
create table if not exists action_items (
  id              uuid primary key default uuid_generate_v4(),
  sprint_id       uuid not null references sprints(id) on delete cascade,
  type            text not null check (type in ('Retro','Planning')),
  assignee_id     uuid references auth.users(id),
  text            text not null,
  due_date        date,
  status          text not null default 'Open' check (status in ('Open','InProgress','Done','CarriedOver','Dropped')),
  carried_from_id uuid references action_items(id),
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- BLOCKERS
-- ──────────────────────────────────────────────────────────────
create table if not exists blockers (
  id             uuid primary key default uuid_generate_v4(),
  team_id        uuid not null references teams(id) on delete cascade,
  sprint_id      uuid references sprints(id),
  title          text not null,
  description    text,
  raised_by      uuid not null references auth.users(id),
  owner_id       uuid references auth.users(id),
  status         text not null default 'Open' check (status in ('Open','InProgress','Resolved')),
  jira_issue_id  text,
  created_at     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- SPRINT PLANNING
-- ──────────────────────────────────────────────────────────────
create table if not exists focus_topics (
  id         uuid primary key default uuid_generate_v4(),
  sprint_id  uuid not null references sprints(id) on delete cascade,
  title      text not null,
  content    text,
  status     text not null default 'OnTrack' check (status in ('OnTrack','AtRisk','OnHold','Done')),
  "order"    int not null default 0
);

create table if not exists recurring_agenda_items (
  id                        uuid primary key default uuid_generate_v4(),
  team_id                   uuid not null references teams(id) on delete cascade,
  title                     text not null,
  last_status               text,
  snoozed_until_sprint_number int
);

-- ──────────────────────────────────────────────────────────────
-- ICEBREAKERS
-- ──────────────────────────────────────────────────────────────
create table if not exists icebreakers (
  id       uuid primary key default uuid_generate_v4(),
  text     text not null,
  category text not null default 'general',
  source   text not null default 'seeded'
);

insert into icebreakers (id, text, category) values
  ('a1000001-0000-0000-0000-000000000001', 'What''s one thing you''re looking forward to this week?', 'quick'),
  ('a1000001-0000-0000-0000-000000000002', 'If you could have any superpower for just today, what would it be?', 'fun'),
  ('a1000001-0000-0000-0000-000000000003', 'What''s the best piece of advice you''ve ever received?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000004', 'What''s a skill you''ve picked up in the last year that surprised you?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000005', 'If your current project was a movie, what genre would it be?', 'retro'),
  ('a1000001-0000-0000-0000-000000000006', 'What emoji best describes how you''re feeling right now?', 'quick'),
  ('a1000001-0000-0000-0000-000000000007', 'What''s one thing outside of work you''ve been enjoying lately?', 'fun'),
  ('a1000001-0000-0000-0000-000000000008', 'What''s your go-to strategy when you''re stuck on a hard problem?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000009', 'If the sprint was a road trip, where did we end up vs. where we planned to go?', 'retro'),
  ('a1000001-0000-0000-0000-000000000010', 'What''s one word that describes last sprint?', 'retro'),
  ('a1000001-0000-0000-0000-000000000011', 'What''s a tool or shortcut you''ve discovered recently that saves you time?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000012', 'What''s the most interesting thing you''ve learned in the last two weeks?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000013', 'If you could change one thing about how the team communicates, what would it be?', 'retro'),
  ('a1000001-0000-0000-0000-000000000014', 'What''s something small that made your day better recently?', 'fun'),
  ('a1000001-0000-0000-0000-000000000015', 'If you had a theme song that played when you entered a room, what would it be?', 'fun'),
  ('a1000001-0000-0000-0000-000000000016', 'What''s the most challenging part of remote/hybrid work for you?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000017', 'What''s a technical concept you wish you had learned earlier in your career?', 'team-building'),
  ('a1000001-0000-0000-0000-000000000018', 'What''s the last thing that made you laugh out loud?', 'fun'),
  ('a1000001-0000-0000-0000-000000000019', 'If the team was a band, what instrument would each person play?', 'fun'),
  ('a1000001-0000-0000-0000-000000000020', 'What''s one habit you''re trying to build or break right now?', 'quick')
on conflict (id) do nothing;

-- ──────────────────────────────────────────────────────────────
-- JIRA INTEGRATIONS
-- ──────────────────────────────────────────────────────────────
create table if not exists jira_integrations (
  id                     uuid primary key default uuid_generate_v4(),
  team_id                uuid not null references teams(id) on delete cascade unique,
  cloud_id               text not null,
  cloud_name             text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at       timestamptz not null,
  created_at             timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- ENABLE REALTIME on tables that need live sync
-- ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table retro_sessions;
alter publication supabase_realtime add table retro_cards;
alter publication supabase_realtime add table retro_votes;
alter publication supabase_realtime add table mood_checkins;
alter publication supabase_realtime add table poker_sessions;
alter publication supabase_realtime add table poker_tickets;
alter publication supabase_realtime add table poker_votes;
alter publication supabase_realtime add table blockers;
alter publication supabase_realtime add table focus_topics;

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

-- Helper: is the current user a member of the given team?
create or replace function is_team_member(p_team_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

-- Helper: is the current user an admin of the given team?
-- MUST be security definer so it bypasses RLS (avoids infinite recursion
-- when used inside policies on team_members itself).
create or replace function is_team_admin(p_team_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'Admin'
  );
$$;

-- Teams
alter table teams enable row level security;
create policy "team members can view team"
  on teams for select using (is_team_member(id));
create policy "authenticated users can create teams"
  on teams for insert with check (auth.uid() = created_by);
create policy "team admins can update team"
  on teams for update using (is_team_admin(id));

-- Team members
alter table team_members enable row level security;
create policy "team members can view members"
  on team_members for select using (is_team_member(team_id));
-- Use is_team_admin (security definer) to avoid infinite recursion —
-- a plain inline subquery on team_members inside a team_members policy causes 42P17.
create policy "team admins can manage members"
  on team_members for all using (is_team_admin(team_id));

-- Sprints
alter table sprints enable row level security;
create policy "team members can view sprints"
  on sprints for select using (is_team_member(team_id));
create policy "team members can create sprints"
  on sprints for insert with check (is_team_member(team_id));
create policy "team members can update sprints"
  on sprints for update using (is_team_member(team_id));

-- Retro cards: only revealed cards visible to everyone; own hidden cards visible to author
alter table retro_cards enable row level security;
create policy "see revealed or own retro cards"
  on retro_cards for select using (
    is_revealed = true or author_id = auth.uid()
  );
create policy "team members can insert retro cards"
  on retro_cards for insert with check (author_id = auth.uid());
create policy "authors can update their retro cards"
  on retro_cards for update using (author_id = auth.uid());

-- Poker votes: only see own vote until revealed
alter table poker_votes enable row level security;
create policy "see own vote or revealed votes"
  on poker_votes for select using (
    user_id = auth.uid() or revealed_at is not null
  );
create policy "insert own vote"
  on poker_votes for insert with check (user_id = auth.uid());
create policy "update own vote"
  on poker_votes for update using (user_id = auth.uid());

-- Blockers, focus topics, action items: team members only
alter table blockers enable row level security;
create policy "team members can manage blockers"
  on blockers for all using (is_team_member(team_id));

alter table action_items enable row level security;
create policy "sprint team members can manage action items"
  on action_items for all using (
    exists (select 1 from sprints s where s.id = sprint_id and is_team_member(s.team_id))
  );

alter table focus_topics enable row level security;
create policy "sprint team members can manage focus topics"
  on focus_topics for all using (
    exists (select 1 from sprints s where s.id = sprint_id and is_team_member(s.team_id))
  );
