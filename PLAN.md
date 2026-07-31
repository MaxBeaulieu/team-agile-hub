# Team Agile Hub — Project Plan

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2.2, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (new-york), next-themes, lucide-react, sonner |
| Backend | ASP.NET Core (.NET 10), port **5074**, supabase-csharp 0.16.2, Newtonsoft.Json |
| Auth | Supabase Auth (email/password), JWT ES256 validated via OIDC JWKS discovery on the C# backend |
| Database | Supabase (PostgreSQL) — accessed exclusively via REST API (supabase-csharp SDK, no direct TCP/Npgsql) |
| Realtime | Supabase Realtime (enabled on retro, poker, blockers, focus_topics tables) |

### Architecture Rules
- **All data flows through the C# API.** Frontend client components call `/api/*` endpoints on the C# backend. No page ever queries Supabase directly.
- The backend holds the service role key and handles all DB operations.
- The backend serialises JSON as **camelCase** (Newtonsoft.Json defaults). Frontend types must match.
- Session refresh lives in `frontend/src/proxy.ts` (Next.js route handler acting as middleware).

---

## Database Schema (all tables exist in migration `001_initial_schema.sql`)

| Table | Purpose |
|---|---|
| `teams` | Core team record (name, sprint_term, created_by) |
| `team_members` | User ↔ team membership (role: Member / Admin) |
| `sprints` | Sprint records (goal, dates, status: Planning / Active / Completed) |
| `sprint_members` | Per-sprint capacity (days_off, capacity_score 1-10) |
| `sprint_trainings` | Training items per user per sprint |
| `retro_sessions` | Retro state machine (phase, columns, vote config, speaker order) |
| `retro_cards` | Retro cards (column, content, grouping, reveal flag) |
| `retro_votes` | Votes cast per card per user |
| `mood_checkins` | Entry/exit mood (1-5) per user per retro session |
| `poker_sessions` | Planning poker session (deck type, status) |
| `poker_tickets` | Tickets to estimate (Jira ID, title, final points) |
| `poker_votes` | Per-user estimates (hidden until revealed) |
| `action_items` | Action items from retro or planning (carry-over support) |
| `blockers` | Team blockers (status: Open / InProgress / Resolved, optional Jira link) |
| `focus_topics` | Sprint planning focus topics (status: OnTrack / AtRisk / OnHold / Done) |
| `recurring_agenda_items` | Team-level recurring items (snooze by sprint number) |
| `icebreakers` | Seeded icebreaker question bank (20 questions across 4 categories) |
| `jira_integrations` | Per-team Jira OAuth tokens (encrypted, cloud_id, expiry) |
| `talking_points` | Discussion points — polymorphic: belongs to focus_topic OR recurring_agenda_item — _migration 003_ |
| `talking_point_notes` | Collaborative notes per talking point (realtime) — _migration 003_ |

---

## What's Done ✅

### Infrastructure
- [x] Monorepo scaffold: `frontend/`, `backend/`, `supabase/`
- [x] Supabase project connected, all migrations applied
- [x] C# backend: JWT bearer auth via OIDC discovery, CORS configured
- [x] Frontend proxy (`proxy.ts`) for session refresh + auth-guarded redirects
- [x] 4-theme UI system (light / dark / system + custom colour themes)
- [x] Dashboard layout with sidebar navigation
- [x] `api` helper utility on the frontend for authenticated calls to the C# backend

### Teams
- [x] **Create team** — name + sprint term (POST `/api/teams`)
- [x] **View teams** — list with member avatars, sprint term badge (GET `/api/teams`)
- [x] **Join team** — invite token flow (POST `/api/teams/join`)
- [x] **Team settings** — rename team, regenerate invite token (PATCH `/api/teams/{id}`)
- [x] **Member display** — avatar initials from display name, role badge
- [x] RLS policies verified and working (non-recursive `team_members` SELECT policy)

### Sprints
- [x] `GET /api/teams/{teamId}/sprints` — list sprints for a team
- [x] `POST /api/teams/{teamId}/sprints` — create sprint (auto-seeds recurring agenda items as focus topics)
- [x] `GET /api/teams/{teamId}/sprints/{id}` — sprint detail with members, trainings, focus topics, action items, blockers
- [x] `PATCH /api/teams/{teamId}/sprints/{id}` — update sprint (name, goal, championId, status)
- [x] `PUT /api/teams/{teamId}/sprints/{id}/members/{userId}` — upsert sprint member capacity (daysOff, capacityScore)
- [x] `PUT /api/teams/{teamId}/sprints/{id}/trainings/{userId}` — upsert sprint training
- [x] **Sprints page** — sprint list grouped by status, New Sprint dialog, sprint cards with champion/dates/members

### Sprint Planning
- [x] **Sprint Planning page** (`/dashboard/planning`) — sprint header, capacity grid, trainings, focus topics, recurring agenda, action item carry-over
- [x] `GET /api/teams/{teamId}/sprints/{sprintId}/planning` — aggregate: sprint + team members + recurring agenda + carry-over items + talking points
- [x] `PUT /api/teams/{teamId}/sprints/{id}/members/{userId}` — upsert capacity (daysOff, capacityScore 1-10)
- [x] Focus Topics CRUD — `POST /api/teams/{teamId}/sprints/{sprintId}/focus-topics`, `PATCH /api/teams/{teamId}/focus-topics/{id}`, `DELETE`
- [x] Talking Points per focus topic — `POST .../focus-topics/{topicId}/talking-points`, `PATCH /api/teams/{teamId}/talking-points/{id}`, `DELETE`
- [x] Talking Points per agenda item — same shape, polymorphic (focusTopicId OR agendaItemId)
- [x] Talking Point Notes — `POST /api/teams/{teamId}/talking-points/{id}/notes`, `DELETE /api/teams/{teamId}/notes/{id}` (realtime via Supabase)
- [x] Recurring Agenda CRUD — `GET/POST/PATCH/DELETE /api/teams/{teamId}/recurring-agenda`
- [x] Action Items CRUD — `POST /api/teams/{teamId}/sprints/{sprintId}/action-items`, `PATCH /api/teams/{teamId}/action-items/{id}`, `DELETE`

### Sprint Retro
- [x] **Migration** `004_retro_improvements.sql` — `facilitator_id` on sessions, `is_discussed` on cards, RLS for `retro_sessions`/`retro_votes`/`mood_checkins`, `is_sprint_member()` helper
- [x] **RetroController** — 12 endpoints: create, full-state GET, config PATCH, advance phase, add/update/delete cards, PUT votes (full state), mood upsert, icebreaker re-roll, advance speaker, set discuss card, create retro action item
- [x] **Retro page** (`/dashboard/retro?sprintId=&teamId=`) — phase router, Supabase Realtime subscriptions (full-refresh strategy), facilitator bar, phase progress, create-session dialog
- [x] **CheckIn panel** — emoji mood picker (1-5), team avatar grid with check marks, entry mood tracking
- [x] **Icebreaker panel** — question card, speaker spotlight, speaking-order queue strip, re-roll (facilitator), advance speaker (facilitator)
- [x] **Write panel** — per-column card input (Enter to add), own cards display, hidden-count placeholders for others
- [x] **Group panel** — all cards revealed, checkbox multi-select, "Group" button → label dialog, group label chips, facilitator ungroup
- [x] **Vote panel** — per-card +/- controls, vote budget bar, debounced PUT votes sync
- [x] **Discuss panel** — sorted by votes, active card spotlight, collaborative notes (debounced PATCH), add action item, mark discussed (facilitator)
- [x] **WrapUp panel** — exit mood picker, mood comparison bar charts (entry vs exit), session summary stats, top-5 voted cards

### Planning Poker
- [x] **Migration** `005_poker_improvements.sql` — `facilitator_id` on `poker_sessions`, RLS for `poker_sessions` + `poker_tickets`, realtime publication for all 3 poker tables
- [x] **PokerController** — 8 endpoints: create session (idempotent), full-state GET (vote hiding), add ticket, delete ticket, cast/update vote, reveal votes (facilitator), update ticket + advance, set current ticket
- [x] **Poker list page** (`/dashboard/poker/list`) — sprint picker, links to per-sprint poker session, mirrors retro list pattern
- [x] **Poker page** (`/dashboard/poker?sprintId=&teamId=`) — session creation with deck selection, Supabase Realtime, facilitator vs voter UX
- [x] **TicketSidebar** — ticket list with status icons, add ticket form (title/description/jiraId), delete (facilitator), click to jump (facilitator)
- [x] **VotingArea** — deck card grid, my vote highlight, vote progress chips (revealed names + estimate), vote summary after reveal, set final points + advance (facilitator), unanimity indicator
- [x] Sidebar nav "Planning Poker" item, sprint card "Poker →" quick link

### Blockers
- [x] **BlockersController** — 4 endpoints: list (optional `?sprintId=`, `?status=`), create (sets `raisedBy` from JWT), patch (partial update: title, description, status, owner, sprint, jira), delete (any team member)
- [x] **Blockers page** (`/dashboard/blockers`) — three-column kanban (Open / In Progress / Resolved), team + sprint + status filters, blocker cards with inline status changer, owner + sprint + Jira link badges
- [x] **Create / Edit dialog** — title, description, sprint selector, owner selector (from team members), Jira issue ID
- [x] **Delete confirmation dialog**
- [x] **Optimistic status updates** — card moves column instantly, rolls back on API error, no loading flash
- [x] **Realtime sync** — Supabase Realtime on `blockers` table, silent background refresh (no loading spinner)

### Sprint Health Dashboard
- [x] **HealthController** — single endpoint `GET /api/teams/{teamId}/sprints/{sprintId}/health`, returns all metrics in one response (5 parallelized query batches)
- [x] **Health page** (`/dashboard/sprints/[id]/health?teamId=`) — 6-widget responsive grid (2×3 on xl)
- [x] **Capacity widget** — per-member capacity score bar (color-coded 1-10) + days-off count
- [x] **Action Items widget** — completion count, stacked proportional bar chart (Done/In Progress/Open/CarriedOver/Dropped) + legend
- [x] **Blockers widget** — three-column stat display (Open/In Progress/Resolved) with color coding
- [x] **Mood widget** — avg entry and exit mood (emoji + number), delta arrow, check-in count
- [x] **Velocity widget** — current sprint total points, CSS bar chart of last 8 sprints (current sprint highlighted)
- [x] **Poker Consensus widget** — per-ticket final points + vote spread indicator (✓ unanimous / ±N variance)
- [x] Sprint card "Health →" quick link added

### Action Items Tracker
- [x] `GET /api/teams/{teamId}/action-items` — returns `{ items, sprints }`, optional `?sprintId=`, `?status=`, `?type=`, `?assigneeId=` filters; resolves team's sprint IDs first (no `team_id` on `action_items`)
- [x] **Action Items page** (`/dashboard/action-items`) — team selector, filter bar (sprint / type / status), open + overdue summary badges
- [x] Each row: clickable status badge (dropdown, optimistic update + rollback), type chip, sprint badge, assignee, due-date chip (red when overdue), `↩ Carried` badge for carry-over chain, strikethrough for done/dropped
- [x] "Action Items" sidebar nav entry (`CheckSquare` icon)

### Jira Integration
- [x] **JiraEncryptionService** — AES-256-CBC for token encryption; HMAC-SHA256 signed state param (with 10 min expiry)
- [x] `GET /api/teams/{teamId}/jira/auth-url` — generates Atlassian OAuth 2.0 (3-LO) URL with signed state
- [x] `GET /api/jira/callback` — exchanges code, fetches accessible resources (cloud_id/name), encrypts + upserts tokens, redirects to frontend
- [x] `GET /api/teams/{teamId}/jira/status` — returns `{ connected, cloudName }`
- [x] `GET /api/teams/{teamId}/jira/issues?jql=` — proxies Jira REST API v3 search with auto token refresh
- [x] `POST /api/teams/{teamId}/jira/issues` — creates a Jira issue (projectKey, summary, issueType)
- [x] `DELETE /api/teams/{teamId}/jira` — disconnects (removes stored tokens)
- [x] **Settings page** (`/dashboard/settings`) — team selector, Jira connect/disconnect card, connection status badge

## In Progress 🔄

*Nothing currently in progress.*

---

## To Do ⏳

The sections below are ordered by logical dependency.

---

### 1. OpenAI Integration (AI Assist)

**Features (progressive enhancement — add after core features):**
- Retro: AI summary of all cards at end of session
- Sprint planning: AI-suggested goal based on previous sprint's goal + action items
- Blockers: AI-suggested resolution steps
- Planning Poker: AI ticket description enrichment from Jira summary

**Backend:** All OpenAI calls stay server-side (key never exposed to frontend). Add `AiController.cs`.

---

## File Structure Reference

```
team-agile-hub/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── dashboard/
│       │   │   ├── layout.tsx                    ✅ sidebar layout
│       │   │   ├── page.tsx                      ✅ dashboard home (feature cards)
│       │   │   ├── teams/
│       │   │   │   ├── page.tsx                  ✅ team list
│       │   │   │   ├── team-card.tsx             ✅
│       │   │   │   ├── create-team-dialog.tsx    ✅
│       │   │   │   └── join-team-dialog.tsx      ✅
│       │   │   ├── sprints/
│       │   │   │   ├── page.tsx                  ✅ sprint list grouped by status
│       │   │   │   ├── sprint-card.tsx           ✅
│       │   │   │   └── create-sprint-dialog.tsx  ✅
│       │   │   ├── planning/
│       │   │   │   ├── page.tsx                  ✅ sprint planning hub
│       │   │   │   ├── capacity-section.tsx      ✅ team capacity grid
│       │   │   │   ├── focus-topics-section.tsx  ✅ focus topics + talking points
│       │   │   │   ├── agenda-section.tsx        ✅ recurring agenda + talking points
│       │   │   │   ├── action-items-section.tsx  ✅ action items + carry-over
│       │   │   │   └── list/page.tsx             ⏳ placeholder
│       │   │   ├── blockers/
│       │   │   │   └── page.tsx                  ✅ kanban board + realtime
│       │   │   ├── action-items/
│       │   │   │   └── page.tsx                  ✅ tracker: filters, optimistic status, overdue highlights
│       │   │   ├── health/
│       │   │   │   └── page.tsx                  ✅ sprint-picker landing page
│       │   │   ├── sprints/
│       │   │   │   ├── [id]/
│       │   │   │   │   └── health/
│       │   │   │   │       └── page.tsx          ✅ sprint health dashboard
│       │   │   │   ├── page.tsx                  ✅ sprint list grouped by status
│       │   │   │   ├── sprint-card.tsx           ✅
│       │   │   │   └── create-sprint-dialog.tsx  ✅
│       │   │   ├── settings/
│       │   │   │   └── page.tsx                  ✅ Jira connect/disconnect card
│       │   └── auth/                             ✅ login / signup / OAuth callback
│       ├── components/
│       │   ├── ui/                               ✅ shadcn components
│       │   └── providers/
│       │       └── theme-provider.tsx            ✅ 4-theme system
│       ├── lib/
│       │   ├── api.ts                            ✅ authenticated fetch helper
│       │   ├── utils.ts                          ✅ cn() utility
│       │   └── supabase/
│       │       ├── client.ts                     ✅ browser client
│       │       └── server.ts                     ✅ SSR client
│       └── proxy.ts                              ✅ session refresh route handler
├── backend/
│   ├── Controllers/
│   │   ├── TeamsController.cs                    ✅ full CRUD + invite + member mgmt
│   │   ├── SprintsController.cs                  ✅ full CRUD + capacity + trainings
									│   │   ├── PlanningController.cs                 ✅ planning aggregate, focus topics, talking points, notes, action items, recurring agenda + GET /action-items
│   │   ├── BlockersController.cs                 ✅ CRUD + team-member auth
│   │   ├── HealthController.cs                   ✅ sprint health aggregate (5 query batches)
│   │   └── JiraController.cs                     ✅ OAuth 3-LO, status, issue search/create, disconnect
│   ├── Models/                                   ✅ all models defined
│   ├── Services/
│   │   ├── SupabaseService.cs                    ✅ Supabase client wrapper
│   │   └── JiraEncryptionService.cs              ✅ AES-256-CBC + HMAC state signing
│   └── Data/
│       ├── AppDbContext.cs                       ✅ EF Core context (retro + poker)
│       └── IcebreakerSeeds.cs                    ✅ 20 seeded questions
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql                ✅ all core tables + RLS (blockers table + realtime here)
        ├── 002_fix_team_members_rls.sql          ✅ RLS recursion fix
        ├── 003_epics_and_talking_points.sql      ✅ talking points, notes (epics dropped in 018)
        ├── 004_retro_improvements.sql            ✅ facilitator_id, is_discussed, retro RLS
        └── 005_poker_improvements.sql            ✅ poker facilitator_id, RLS, realtime (idempotent)
```

---

## Known Decisions & Constraints

| Decision | Reason |
|---|---|
| supabase-csharp SDK over Npgsql | IPv6/SSL issues with direct DB TCP from dev machine; REST API works reliably |
| Service role key on backend only | Bypasses RLS for server-side operations; frontend never sees it |
| `team_members` RLS uses `user_id = auth.uid()` directly | Avoids recursive call through `is_team_member()` function |
| All enums stored as `text` | Avoids Npgsql enum mapping complexity with supabase-csharp |
| Realtime on specific tables only | Retro, poker, blockers, focus_topics need live sync; others are request/response |
