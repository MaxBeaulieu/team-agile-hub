# Team Agile Hub

Real-time agile tooling for small teams — sprint retros, planning poker, sprint planning, and more.

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Next.js 16 (React + TypeScript) | Vercel |
| Backend API | ASP.NET Core Web API (.NET 10, C#) | Fly.io |
| Database + Auth + Realtime | Supabase (PostgreSQL) | Supabase Cloud |
| AI features | OpenAI API | via backend |
| JIRA integration | Atlassian OAuth 2.0 | via backend |

## Project structure

```
team-agile-hub/
├── frontend/          # Next.js app
├── backend/           # ASP.NET Core Web API
└── supabase/
    ├── config.toml    # Local Supabase stack config (committed)
    └── migrations/    # SQL schema migrations
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | `node -v` |
| .NET SDK | 10.0+ | `dotnet --version` |
| Docker Desktop | latest | Required only for local Supabase |
| Supabase CLI | 2.x | No install needed — use `npx supabase` |

## Getting started

Pick **one** of the two setups below, then continue to [Backend](#3-backend) and
[Frontend](#4-frontend).

### Option A — Local Supabase (recommended for development)

Runs the whole Supabase stack (Postgres, Auth, Realtime, Storage, Studio) in
Docker. No cloud project needed, and migrations are applied automatically.

```bash
# From the repo root. Docker Desktop must be running.
npx supabase start
```

First run pulls several images and takes a few minutes. When it finishes it
prints your local URLs and keys — keep that output, you need it for the `.env`
files. You can reprint it any time with `npx supabase status`.

| Service | URL |
|---|---|
| API gateway | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (DB browser) | http://127.0.0.1:54323 |
| Mailpit (catches all outgoing email) | http://127.0.0.1:54324 |

Everything in `supabase/migrations/` is applied automatically on first start.

> #### ⚠️ Use `127.0.0.1` for Supabase, `localhost` for the app
>
> Do not point the frontend at `http://localhost:54321`, even though it resolves
> to the same place. **Cookies are scoped by host but not by port.** With the app
> on `localhost:3000` and Supabase on `localhost:54321`, every chunked
> `sb-*-auth-token` cookie the app sets is also sent to Supabase's own API. Those
> cookies overflow the Realtime service's request-header limit and the websocket
> handshake fails with `431 Request Header Fields Too Large` — the UI loads but
> never receives live updates.
>
> Keeping the app on `localhost` and Supabase on `127.0.0.1` puts them on
> different hosts, so the cookies are never sent. `supabase/config.toml` pins
> `site_url` to `http://localhost:3000` for the same reason.

Useful commands:

```bash
npx supabase status                  # print URLs + keys again
npx supabase stop                    # stop, preserving data
npx supabase stop --no-backup        # stop and WIPE the local database
npx supabase db reset                # drop, recreate, re-run every migration + seed
npx supabase migration new <name>    # scaffold a new timestamped migration
```

`supabase/config.toml` is committed, so settings the app depends on — notably
`enable_anonymous_sign_ins = true`, required for retro invite links — are already
correct. Editing `config.toml` requires `npx supabase stop && npx supabase start`
to take effect.

### Option B — Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the migrations in `supabase/migrations/` **in filename order** via the
   SQL Editor (or `npx supabase link --project-ref <ref>` then `npx supabase db push`)
3. Under Authentication → Providers, enable **Anonymous sign-ins** (needed for
   retro invite links)
4. Copy your **Project URL**, **anon key**, and **service role key** from
   Project Settings → API

### 3. Backend

```bash
cd backend
cp .env.example .env
dotnet run
# API runs at http://localhost:5000
# Swagger UI at http://localhost:5000/swagger
```

The backend loads `.env` first and then `.env.local`, so **`.env.local` overrides
`.env`**. Keep shared defaults in `.env` and machine-specific local values in
`.env.local`. Both are gitignored.

For **Option A (local Supabase)**, create `backend/.env.local` with:

```ini
Supabase__Url=http://localhost:54321
Supabase__ServiceRoleKey=<"Secret" key from `npx supabase status`>
Cors__AllowedOrigins=http://localhost:3000
```

`Supabase__Url` may safely stay on `localhost` here — the cookie problem above is
browser-only, and the backend talks to Supabase server-to-server. It is used both
as the REST endpoint and to fetch JWKS for JWT validation.

The backend authenticates with the **service role key**, which bypasses RLS.
`ConnectionStrings__DefaultConnection` is optional — all database access goes
through the Supabase REST API, not a direct Postgres connection. `Jira__*`,
`OpenAI__ApiKey`, and `Encryption__Key` are only needed for the JIRA and AI
features; leave the placeholders if you are not using them.

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_ANON_KEY (the "Publishable" key from `npx supabase status`)

# Sanity check: confirm Node and npm are available
node -v
npm -v

# If you use Volta and npm is not recognized:
volta install node@20

npm install
npm run dev
# App runs at http://localhost:3000
```

`NEXT_PUBLIC_*` variables are inlined at build time — **restart the dev server**
after changing `.env.local`.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `431 Request Header Fields Too Large` on `ws://.../realtime/v1/websocket` | Frontend is pointed at `localhost:54321`. Use `127.0.0.1:54321` (see the warning above), restart the dev server, and clear old `localhost` cookies. |
| `Anonymous sign-ins are disabled` when opening a retro invite link | Set `enable_anonymous_sign_ins = true` in `supabase/config.toml` and restart the stack (Option A), or enable it in the dashboard (Option B). |
| Suddenly logged out after changing `NEXT_PUBLIC_SUPABASE_URL` | Expected. The auth cookie name is derived from the Supabase URL, so changing the host starts a new session. Log in again. |
| `permission denied for table ...` (`42501`) | Base table grants are missing; ensure `009_grant_base_privileges.sql` has been applied. `npx supabase db reset` fixes it. |
| `violates check constraint "..._role_check"` (`23514`) | Legacy PascalCase enum values; ensure `010_normalize_enum_casing.sql` has been applied. |
| Docker port conflicts on start | Another Supabase project is running. `npx supabase stop --project-id <other>` or change the ports in `config.toml`. |


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
| Schema | `supabase/migrations/007_seats.sql` |

Desk positions, pod layout, and seat numbering live in `floorGeometry.ts` and are **not** stored in the database — moving furniture is a code change. The `seats` table holds only per-desk *state* (occupant, assignment, note, service status), joined to the drawing by `seat_number`.

A [`floor-map` skill](.github/skills/floor-map/SKILL.md) captures the conventions for working in this area.
