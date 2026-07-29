-- ============================================================
-- Epics, Epic KPIs, Talking Points, Talking Point Notes
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- EPICS
-- ──────────────────────────────────────────────────────────────
create table if not exists epics (
  id                   uuid primary key default uuid_generate_v4(),
  team_id              uuid not null references teams(id) on delete cascade,
  title                text not null,
  description          text,
  status               text not null default 'on_track'
                         check (status in ('on_track','at_risk','on_hold','done')),
  expected_delivery    date,
  jira_issue_id        text,
  created_at           timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- EPIC SUCCESS CRITERIA / KPIs
-- ──────────────────────────────────────────────────────────────
create table if not exists epic_kpis (
  id            uuid primary key default uuid_generate_v4(),
  epic_id       uuid not null references epics(id) on delete cascade,
  label         text not null,
  target_value  text,
  current_value text,
  is_done       boolean not null default false,
  "order"       int not null default 0
);

-- ──────────────────────────────────────────────────────────────
-- TALKING POINTS
-- Polymorphic: belongs to either a focus_topic or a recurring_agenda_item
-- ──────────────────────────────────────────────────────────────
create table if not exists talking_points (
  id                      uuid primary key default uuid_generate_v4(),
  focus_topic_id          uuid references focus_topics(id) on delete cascade,
  agenda_item_id          uuid references recurring_agenda_items(id) on delete cascade,
  text                    text not null,
  "order"                 int not null default 0,
  created_at              timestamptz not null default now(),
  -- exactly one parent must be set
  constraint talking_point_has_one_parent check (
    (focus_topic_id is not null)::int + (agenda_item_id is not null)::int = 1
  )
);

-- ──────────────────────────────────────────────────────────────
-- TALKING POINT NOTES (collaborative, realtime)
-- ──────────────────────────────────────────────────────────────
create table if not exists talking_point_notes (
  id               uuid primary key default uuid_generate_v4(),
  talking_point_id uuid not null references talking_points(id) on delete cascade,
  author_id        uuid not null references auth.users(id),
  content          text not null,
  created_at       timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- ALTER EXISTING TABLES
-- ──────────────────────────────────────────────────────────────

-- Link focus topics to an epic (optional)
alter table focus_topics add column if not exists epic_id uuid references epics(id) on delete set null;

-- Link action items to a talking point (optional — created inline on a point)
alter table action_items add column if not exists talking_point_id uuid references talking_points(id) on delete set null;

-- ──────────────────────────────────────────────────────────────
-- REALTIME
-- ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table talking_point_notes;

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
alter table epics enable row level security;
create policy "team members can manage epics"
  on epics for all using (is_team_member(team_id));

alter table epic_kpis enable row level security;
create policy "team members can manage epic kpis"
  on epic_kpis for all using (
    exists (select 1 from epics e where e.id = epic_id and is_team_member(e.team_id))
  );

alter table talking_points enable row level security;
create policy "team members can manage talking points"
  on talking_points for all using (
    exists (
      select 1 from focus_topics ft
        join sprints s on s.id = ft.sprint_id
      where ft.id = focus_topic_id and is_team_member(s.team_id)
    )
    or
    exists (
      select 1 from recurring_agenda_items ra
      where ra.id = agenda_item_id and is_team_member(ra.team_id)
    )
  );

alter table talking_point_notes enable row level security;
create policy "team members can manage talking point notes"
  on talking_point_notes for all using (
    exists (
      select 1 from talking_points tp
        left join focus_topics ft on ft.id = tp.focus_topic_id
        left join sprints s on s.id = ft.sprint_id
        left join recurring_agenda_items ra on ra.id = tp.agenda_item_id
      where tp.id = talking_point_id
        and (is_team_member(s.team_id) or is_team_member(ra.team_id))
    )
  );
