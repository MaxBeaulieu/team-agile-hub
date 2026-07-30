# Team Agile Hub

Real-time agile tooling for small teams — sprint retros, planning poker, sprint planning, and more.

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Next.js 14 (React + TypeScript) | Vercel |
| Backend API | ASP.NET Core Web API (C#) | Fly.io |
| Database + Auth + Realtime | Supabase (PostgreSQL) | Supabase Cloud |
| AI features | OpenAI API | via backend |
| JIRA integration | Atlassian OAuth 2.0 | via backend |

## Project structure

```
team-agile-hub/
├── frontend/          # Next.js app
├── backend/           # ASP.NET Core Web API
└── supabase/
    └── migrations/    # SQL schema migrations
```

## Getting started

### 1. Supabase setup
1. Create a project at [supabase.com](https://supabase.com)
2. Run every file in `supabase/migrations/` in the Supabase SQL editor, in filename order (`001_…` through `006_…`). They are idempotent, so re-running is safe.
3. Copy your **Project URL**, **Anon key**, and **JWT secret** from Project Settings → API

> Skipping a migration surfaces as a `PGRST205 — Could not find the table …` error from the API rather than a startup failure, because the backend talks to PostgREST rather than owning the schema.

### 2. Backend
```bash
cd backend
cp .env.example .env
# Fill in .env with your Supabase JWT secret, DB connection string, JIRA and OpenAI keys
dotnet run
# API runs at http://localhost:5000
# Swagger UI at http://localhost:5000/swagger
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env.local
# Fill in .env.local with your Supabase URL and anon key

# Sanity check: confirm Node and npm are available
node -v
npm -v

# If you use Volta and npm is not recognized:
volta install node@20

npm run dev
# App runs at http://localhost:3000
```

## Deployment

### Backend → Fly.io
```bash
cd backend
fly launch        # first time
fly deploy        # subsequent deploys
fly secrets set Supabase__JwtSecret=xxx ConnectionStrings__DefaultConnection=xxx ...
```

### Frontend → Vercel
Connect the `/frontend` folder to a Vercel project. Add environment variables in the Vercel dashboard.

## Features

- **Sprint Retrospective** — Check-in, Icebreaker (voice round-robin spotlight), Write, Group (+ AI suggestions), Vote, Discuss, Wrap-up
- **Planning Poker** — Real-time estimates, JIRA import, story point write-back
- **Sprint Planning** — Capacity, vibe check, training log, sprint focus board, recurring agenda items, sprint champion
- **Blockers Tracker** — Cross-sprint blocker board surfaced in planning and retros
- **Sprint Health Dashboard** — Mood trends, velocity, action item completion, AI retro theme analysis
- **Floor Map** — Top-down office seating chart with seat assignment, notes, and desk defect reports

## Floor Map

`/dashboard/floor` renders the office as a single scaled, top-down SVG — 44 desks across a hex ring (1–8) and six bench pods, A–F — and layers live seat state on top of it.

- **Claim a desk** as *permanent* or *floating*. Taking a new desk automatically releases your previous one, so nobody holds two.
- **Release / unassign** — you can free your own desk; team admins can free anyone's.
- **Capabilities** — each desk records whether it has a dock and a terminal, toggleable as a map layer.
- **Notes** — a free-text note per desk, flagged with a dot on the map.
- **Defect reports** — report a broken desk with a reason. Admins work the queue at `/dashboard/floor/reports` and can copy a pre-formatted message for Slack.
- **Stats** — share of usable seats assigned, broken down by permanent / floating / available / out of service.

The map is deliberately **light-only**. It depicts physical materials — concrete, birch, carpet — so it does not invert with the app theme.

| Piece | Location |
|---|---|
| Components, geometry, tokens, CSS | `frontend/src/components/floor/` |
| Routes | `frontend/src/app/dashboard/floor/` |
| API | `backend/Controllers/SeatsController.cs` |
| Schema | `supabase/migrations/006_seats.sql` |

Desk positions, pod layout, and seat numbering live in `floorGeometry.ts` and are **not** stored in the database — moving furniture is a code change. The `seats` table holds only per-desk *state* (occupant, assignment, note, service status), joined to the drawing by `seat_number`.

A [`floor-map` skill](.github/skills/floor-map/SKILL.md) captures the conventions for working in this area.
