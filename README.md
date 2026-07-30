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
2. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor
3. Copy your **Project URL**, **Anon key**, and **JWT secret** from Project Settings → API

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
