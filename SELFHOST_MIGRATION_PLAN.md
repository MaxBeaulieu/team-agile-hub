# Self-Hosted Migration Plan

Migrate off Supabase, Vercel, and Fly.io entirely onto a single self-managed
host: self-hosted Postgres, fully custom Auth (Entra ID SSO for staff, local
guest auth) and Realtime, and the frontend/backend both running as our own
Docker containers alongside the database — no managed platform left in the
stack.

## Current status — paused 2026-09-01, resume here

Work is **paused mid-Phase-5** to check in on usage before continuing, not because of any blocker. All three teammates (`selfhost-architect`, `selfhost-developer`, `selfhost-deploy-manager`) are stopped and idle with clean, documented stopping points — nothing is mid-edit or in an inconsistent state.

**Done:**
- **Phase 0–1** (foundations + schema) — complete. `AppDbContext`, all entity configs, the `users` table, all 23 CHECK constraints restored (including new ones on all 11 enum columns), one consolidated `InitialSchema` migration. See `docs/architecture/selfhost-migration.md` §3 for the full design.
- **Phase 3** (data-access rewrite) — complete. All 16 controllers + 2 services converted off `sb.Db.From<T>()` onto EF Core; `supabase-csharp` package removed entirely; `SupabaseService.cs` deleted.
- **Phase 4** (SignalR realtime, backend) — complete. `LiveHub`, presence (retro-only, server-derived), the full endpoint→topic broadcast map wired across the 5 controllers that need it.
- **Phase 5, realtime half** (frontend) — ~95% done. `@microsoft/signalr` added, `lib/live.ts` hub client written, `use-retro-roster.ts` rewritten to consume server-side presence, all 4 subscribing pages (retro/quickretro/blockers/poker) swapped onto `useLiveTopic`. Caught and fixed a real bug along the way: `quickretro`'s old channel name would never have received invalidations post-migration, since quick retros and sprint retros share one topic family.
- **Phase 6** (Docker infra) — complete. `docker-compose.yml`, both Dockerfiles, `Caddyfile`, `.env.example` files, the Postgres app-role init script. Never verified with an actual `docker build`/`docker compose up` — nobody in this pipeline has had Docker available (see risk note below).

**Blocked, not started:**
- **Phase 2** (Entra ID auth) — blocked on the org's Entra app registration (single-tenant, redirect URI `https://<host>/api/auth/entra/callback`, `response_mode=form_post`, scopes `openid profile email`). User was talking to the infra team about this as of the pause.
- **Phase 5, auth half** (frontend login/signup pages, `proxy.ts`, `lib/api.ts` token source) — deliberately held back since it depends on Phase 2's backend endpoints existing. Don't start this before Phase 2 lands.

**The one loose thread to resolve first when resuming:** `lib/live.ts`'s hub connection auth and URL are an open design question the developer sent to the architect and never got answered before the pause — accessTokenFactory vs. cookie-only, and a relative vs. `NEXT_PUBLIC_API_URL`-prefixed hub URL. Marked with a TODO comment in the file. This is the very next thing to unblock to finish Phase 5's realtime half.

**Standing accepted risk, not yet closed:** task #15 — the entire backend (schema, all 242 converted call sites, SignalR) has never executed against a real Postgres. Nobody on the team has had Docker/psql access. The enum-converter risk *is* closed (unit-tested with no DB needed, 38/38 passing), but LINQ translation correctness, constraint enforcement, migration-applies, and FK/index materialization are all still unverified. This is recorded in `docs/architecture/selfhost-migration.md` §3.10 with an explicit instruction: **Phase 7 must be budgeted as "first integration," not "validation"** — expect a cluster of failures surfacing together, not a routine QA pass. Resolving this earlier (the moment anyone has a reachable Postgres — a native install or a free-tier cloud instance both work, no Docker required) would meaningfully de-risk the rest of the migration.

**Remaining phases**, in the order they'll actually happen: finish Phase 5's loose thread → Phase 2 (once Entra registration lands) → Phase 5 auth half → Phase 7 (validation — first real run against Postgres) → Phase 8 (cutover: DNS, decommission Vercel/Fly.io/Supabase).

**To resume:** tell the lead session "resume the self-host migration" (or similar) and point at this section. The three teammates can be re-engaged with their existing context via `SendMessage` to their names (`selfhost-architect`, `selfhost-developer`, `selfhost-deploy-manager`) rather than re-spawned from scratch, if this same session is still around; otherwise a fresh session will need to re-read this doc plus `docs/architecture/selfhost-migration.md` before restarting the team.

## Locked-in decisions (from scoping conversation)

| Decision | Answer |
|---|---|
| Scope | **Fully custom.** No Supabase software anywhere — not GoTrue, not PostgREST, not Realtime. Plain Postgres, our own auth, our own realtime. |
| Data | **Dev-only.** No production data to carry over — clean cutover, fresh Postgres, no export/import tooling needed. |
| Infra | **Single self-managed host, docker-compose — and this is the whole production environment, not just the database.** Vercel and Fly.io are both being retired too; Postgres, backend, frontend, and reverse proxy all run as containers on one box, which now carries every production-availability concern (backups, restarts, TLS, deploys) that Vercel/Fly.io/Supabase Cloud used to handle for us. |
| Cutover | **Big bang.** Build the full new stack, validate it, flip over once — no parallel-run/incremental production migration. |
| Auth | **Microsoft Entra ID (Azure AD) SSO, built now, replaces local password auth for staff entirely.** No in-app 2FA — MFA is enforced at the Entra tenant/Conditional Access level, outside this codebase. Guest/anonymous join stays local (guests aren't in the org's Entra tenant). |

## What's actually Supabase-shaped today

This is bigger than swapping a connection string. Four things are Supabase, not just "the database":

1. **Auth** — `@supabase/ssr` (cookie-based sessions in `proxy.ts`), `@supabase/supabase-js` client-side (`auth.getSession()`, `signInAnonymously()`, email/password, PKCE `/auth/callback`). Backend validates via Supabase's OIDC JWKS endpoint.
2. **Realtime** — Presence channels (retro roster) in 5 frontend files, plus implicit `postgres_changes` broadcast (Supabase Realtime replicating table writes to subscribed clients) that live boards rely on for card/vote/blocker updates.
3. **Data access** — 242 call sites across 16 backend files (`sb.Db.From<T>()`) using the `supabase-csharp` PostgREST-style query builder. This *is* the backend's entire data layer.
4. **Schema** — every table FKs to `auth.users(id)`; nearly every migration has RLS policies keyed on `auth.uid()`. There is no `users` table of our own today — Supabase's Auth schema *is* the users table.

One thing in our favor: `AuthExtensions.cs` already supports validating JWTs against a **static symmetric secret**, not just Supabase's OIDC discovery. That path was built for this — we don't need to stand up an OIDC server, just issue our own HS256 JWTs.

One thing simplifying scope: no Supabase Storage usage found anywhere — nothing to migrate there.

**Note on "fully self-hosted":** routing staff auth through Microsoft Entra ID means the stack has one deliberate outbound cloud dependency — the app's login flow needs to reach Entra's endpoints, and staff login stops working if that's unreachable (guest/anonymous join is unaffected). Flagging this since it's a step back from "everything runs on our box," but it's a reasonable, explicit trade for offloading credential storage and MFA enforcement to the org's existing identity provider instead of building/maintaining that ourselves.

## Target architecture

```
docker-compose.yml (single host)
├── postgres          — Postgres 17 (match current major_version), named volume
├── backend           — ASP.NET Core API (own auth endpoints + SignalR hub + data access)
├── frontend           — Next.js (standalone output), talks only to backend
└── proxy              — Caddy or nginx: TLS termination, routes / → frontend, /api|/hub → backend
```

No mail-catcher container needed — staff no longer have local passwords, so there are no confirmation/reset emails to send. (If a future feature needs transactional email, e.g. invite notifications, that's a separate, smaller addition.)

Auth, data access, and realtime all move **into the backend** — nothing sits between the frontend and the API anymore (today, the frontend talks to Supabase directly for auth+realtime and to the backend for everything else; that split goes away).

**This box is now production, not a dev convenience.** With Vercel, Fly.io, and Supabase Cloud all retired, there's no managed platform left absorbing backups, restart-on-crash, TLS renewal, or deploys — this single host does all of it, and it's a single point of failure by construction (one host, one disk, no redundancy). That's a reasonable, explicit trade for the operational simplicity of "one box we fully control," but it means Phase 6 needs to cover real production concerns, not just "does the compose file start" — see the expanded Phase 6 below.

## Phase-by-phase plan

### Phase 0 — Foundations
- Stand up `docker-compose.yml` with a bare Postgres 17 container + volume. Get `dotnet run` and `npm run dev` pointed at it via a plain connection string (no app code changes yet — proves the container plumbing works before anything else changes).
- Decide and pin: **EF Core** (Npgsql.EntityFrameworkCore.PostgreSQL) as the ORM. It's the idiomatic .NET choice, the `Models/` classes already exist as POCOs (currently decorated with `supabase-csharp`/Postgrest attributes), and EF Core Migrations gives us one toolchain for schema evolution instead of hand-written SQL + a separate migration runner.
- Decide and pin: **SignalR** for realtime. It runs natively in the same backend process/container, and every write already flows through a controller — so broadcasting on write is a natural fit, arguably more reliable than the current logical-replication-based `postgres_changes` mechanism.
- Decide and pin: **`Microsoft.Identity.Web`** (Microsoft's own ASP.NET Core library for Entra ID) for the OIDC federation in Phase 2, rather than hand-rolling the authorization-code+PKCE exchange against Entra's endpoints. No password-hashing library needed — staff never have a local password.
- Register an **app registration in Entra ID** (single-tenant, since this is "our AD" not a multi-tenant SaaS): needs a redirect URI, which means the backend must be reachable over HTTPS at a stable URL before this can be tested end-to-end — ties Phase 2 testing to at least a minimal slice of Phase 6 (proxy + domain/TLS) being done first, or a dev tunnel (e.g. `ngrok`) as a stopgap.

### Phase 1 — Schema migration (Postgres, no Supabase concepts)
- Rewrite `supabase/migrations/001`–`019` into a clean, consolidated **initial EF Core migration** (no need to preserve the incremental history since there's no prod data to replay it against).
- Add a real `users` table: `id uuid pk`, `entra_object_id` (nullable, unique — the Entra `oid` claim, stable per-user identifier; null for guests), `email` (nullable — guests have none), `display_name`, `is_anonymous bool`, `created_at`. No `password_hash` column — staff credentials live entirely in Entra ID, never touch our database. Everything that referenced `auth.users(id)` now references `public.users(id)`.
- Drop every RLS policy and `auth.uid()`-based rule. Per `AuthorizationService.cs`'s own comment, RLS here was already "defense in depth only" — the backend connects with a privilege-bypassing key today and will connect as a single application role tomorrow either way, so keeping RLS alive would mean re-deriving `auth.uid()` from a session variable on every connection for a protection that's already fully duplicated in C#. Not worth the complexity — flag for reconsideration only if a second, less-trusted DB consumer shows up later.
- Keep the `PlatformAdmin` / `TeamMember` role model exactly as-is (migration 019) — nothing about it is Supabase-specific.

### Phase 2 — Auth: Entra ID SSO (staff) + local guest auth (backend)
Two genuinely separate identity paths, not one system with a toggle — staff never have a local credential at all, guests never touch Entra:

**Staff — Entra ID (Microsoft.Identity.Web), replaces GoTrue's email/password entirely:**
- `GET /api/auth/entra/login` — redirects into Microsoft's hosted login (`Microsoft.Identity.Web` handles the authorization-code+PKCE exchange, token validation, and signing-key rotation against Entra's own JWKS — we don't hand-roll any of that).
- `GET /api/auth/entra/callback` — on success, look up the `oid` claim in `users.entra_object_id`. First login for that `oid` **just-in-time provisions** a `users` row (`entra_object_id`, `email`, `display_name` from the token claims). Existing team/platform-admin membership is untouched — Entra has no concept of our `team_members`/`platform_admins` tables, so those keep being assigned in-app exactly as today.
- After JIT provisioning/lookup, the backend mints **its own** short-lived HS256 JWT (reusing the symmetric-key path already in `AuthExtensions.cs`) + a rotating refresh token in an httpOnly cookie, and redirects back to the frontend. From this point on, the app's session is fully decoupled from Entra's own token lifecycle — Entra is only consulted at login time, not re-checked on every request. Simpler, and avoids re-deriving our API's auth model around Entra's token expiry/refresh semantics.
- `POST /api/auth/refresh`, `POST /api/auth/logout` — unchanged in shape from the original plan, just fed by Entra-derived identity instead of a password check.
- No signup, no password reset, no email-confirmation flow, no password hashing library — all of that goes away. `AuthExtensions.cs`'s existing OIDC/JWKS branch gets *replaced* (pointed at Entra's discovery doc instead of Supabase's) rather than dropped, if we choose to validate Entra tokens directly anywhere; more likely it stays on the symmetric-key branch only, since the app never validates raw Entra tokens outside the callback handler.

**Guests — unchanged from the original plan, stays local:**
- `POST /api/auth/guest` — creates a `users` row with `is_anonymous = true`, no `entra_object_id`, no email. Issues the same app-level JWT shape as staff, with an `is_anonymous` claim. Replaces `supabase.auth.signInAnonymously()`; this is what `retro/join/[code]/page.tsx` depends on for the "continue as guest" path.

**Deliberately out of scope, per your answer:** no TOTP/WebAuthn, no in-app MFA of any kind. MFA enforcement is entirely an Entra tenant / Conditional Access policy concern — the app can't verify from its own code whether a given login actually satisfied MFA unless we later choose to inspect the `amr` claim as a defense-in-depth check. Worth a one-line decision from whoever owns the Entra tenant config, but it's not backend work.

### Phase 3 — Data access rewrite (backend)
The big mechanical effort: 242 call sites, 16 files.
- Convert `Models/*.cs` from Postgrest attributes to EF Core entity configuration (`OnModelCreating` or `IEntityTypeConfiguration<T>` per model).
- Replace `SupabaseService` (wraps the `supabase-csharp` `Client`) with a plain `AppDbContext : DbContext` + connection-string config.
- Go controller-by-controller replacing `sb.Db.From<T>().Filter(...).Get()` with EF Core LINQ. Suggested order, smallest/lowest-risk first: `MeController` (3) → `WorkloadController` (5) → `BlockersController`/`JiraController` (7) → `RetroTemplatesController` (6) → `RetroInviteController` (4) → `TeamsController`/`SeatsController` (15/17) → `SprintsController` (16) → `QuickRetroController` (28) → `PokerController` (31) → `RetroController` (36) → `PlanningController` (43), plus the two shared services (`AuthorizationService`, `RetroParticipantService`).
- Drop the `supabase-csharp` package once the last call site is converted.

### Phase 4 — Realtime (backend + frontend)
- Add a `SignalR` hub (e.g. `LiveHub`) to the backend, one per collaborative surface or a single hub with room-based groups keyed by session/board id (`retro:{sessionId}`, `poker:{sessionId}`, etc.).
- Every controller action that mutates shared state (card added, vote cast, blocker updated, presence join/leave) also broadcasts to its group — replaces both the presence channel and the implicit `postgres_changes` replication.
- Frontend: replace `supabase.channel(...)` usage in the 5 identified files (`use-retro-roster.ts`, `quickretro/[id]/page.tsx`, `dashboard/retro/page.tsx`, `dashboard/blockers/page.tsx`, `dashboard/poker/page.tsx`) with the `@microsoft/signalr` client. Presence semantics (join/leave/sync, collapsing multiple tabs per user) need to be rebuilt explicitly server-side since SignalR doesn't have Supabase's presence primitive out of the box — track connections per group in the hub.

### Phase 5 — Frontend auth integration
- Delete `frontend/src/lib/supabase/*`, `@supabase/ssr`, `@supabase/supabase-js` from `package.json`.
- `proxy.ts` (currently middleware built on `createServerClient`) becomes a thin check against our own session cookie/JWT instead of calling `supabase.auth.getUser()`.
- `lib/api.ts`'s `getAuthHeaders()` reads the access token from our own auth client instead of `supabase.auth.getSession()`.
- `auth/login` collapses to a single "Sign in with Microsoft" button that navigates to `GET /api/auth/entra/login` (full redirect, not a popup/SDK flow — keeps the frontend free of any Entra-specific client library). `auth/signup` is deleted outright — there's no such thing as local staff signup anymore. `auth/callback` (currently Supabase's PKCE handler) is deleted; the backend's `/api/auth/entra/callback` replaces it and redirects straight to `/dashboard` (or `next`) once the app session cookie is set.
- `retro/join/[code]/page.tsx`'s "Sign in" button (today calling `supabase.auth.signOut()` then routing to the local login form) now just clears any guest session and redirects to `/api/auth/entra/login?next=/retro/join/{code}` — same UX, different backend.

### Phase 6 — Docker Compose, end to end, and production readiness
- Full `docker-compose.yml`: `postgres`, `backend` (multi-stage `Dockerfile` for the .NET app), `frontend` (Next.js standalone build), `proxy` (Caddy is the low-effort choice — auto TLS if there's a domain, trivial config; also the thing that makes the Entra redirect URI valid, see Phase 2). All services `restart: unless-stopped` at minimum, since there's no platform-level process supervision anymore.
- `.env` / `.env.local` conventions carry over (already established in this repo) — new variables: `ConnectionStrings__DefaultConnection`, `Jwt__SigningSecret`, `Jwt__AccessTokenMinutes`, `Entra__TenantId`, `Entra__ClientId`, `Entra__ClientSecret` (or certificate thumbprint, if the org prefers cert-based app auth over a shared secret). Remove all `Supabase__*` and `NEXT_PUBLIC_SUPABASE_*` variables.
- **Backups**: explicitly **not built for now**, by decision. `postgres`'s named volume is the only copy of the data — a host disk failure or a bad `docker compose down -v` is unrecoverable. Accepted given this is a dev-only cutover with no data to protect yet, but flagged as the thing to revisit the moment this database holds anything anyone would be upset to lose — see the open item below.
- **Deploy mechanism**: **Jenkins on a self-hosted runner** (on the host itself, or on a separate box that can reach it) — pipeline runs `git pull && docker compose build && docker compose up -d` (or a rolling per-service equivalent) on merge to `master`, replacing Vercel/Fly.io's git-push-to-deploy. Jenkins job/agent setup is DevOps-owned infra work, parallel to the application migration itself.
- **Monitoring/alerting**: at minimum, something watching container health and disk space and paging someone if either goes bad — doesn't need to be fancy (even a cron'd health-check-and-alert script clears the bar), but "silently down until someone notices" isn't acceptable for a single-host production system. Not yet assigned — reasonable to fold into the same DevOps ownership as host hardening below.
- **Host hardening**: this box is publicly reachable (Entra's redirect URI and the app itself both need to be internet-facing, unless there's a VPN/network-level restriction in play). Basic firewall (only 80/443, SSH, and whatever Jenkins needs exposed), SSH key-only auth, and unattended OS security updates are table stakes. **Owned by the team itself; DevOps is already aware** — no further sign-off needed here, just execution.
- Update `README.md`'s setup instructions to replace the "Option A/B — Supabase local/cloud" section and the "Deployment → Fly.io/Vercel" section with `docker compose up` plus a pointer to the Jenkins pipeline.

### Phase 7 — Validation (pre-cutover, even though cutover itself is big-bang)
"Big bang" describes the production cutover — it shouldn't skip staging validation. Before flipping over:
- Spin up the full compose stack fresh and walk every feature end to end: Entra sign-in (staff), guest-join, retro (all phases incl. live presence + AI suggestions), poker (incl. JIRA write-back), planning, blockers, health dashboard, floor map.
- Specifically re-test the things most likely to regress silently: multi-tab presence collapsing (roster), guest-join-then-later-Entra-sign-in identity continuity (`localStorage` participant-id flow in `retro/join/[code]/page.tsx`), and first-login JIT provisioning (does a brand-new Entra user land with zero team memberships and a sane empty state, or does something assume a `users` row already existed?).
- Test Entra sign-in with an account that's been removed/disabled on the tenant side, to confirm the app fails closed rather than trusting a stale local session.
- Confirm `AuthorizationService`'s permission checks still hold with zero RLS backing them up — this is the one place where "defense in depth" is now fully gone, so it's worth a deliberate second look rather than assuming the existing C# checks are exhaustive.

### Phase 8 — Cutover & cleanup
- DNS cutover: point the domain at the self-managed host's public IP; confirm Caddy issues certs successfully before relying on it.
- Decommission the Vercel project, the Fly.io app, and the Supabase project once nothing points at any of them — including revoking their deploy credentials/secrets, not just letting them sit idle.
- Delete `supabase/` directory and all Supabase/Vercel/Fly.io references in `README.md` (setup instructions, the "Deployment" section, the stack table at the top).

## Open items I'd flag before/while building

- **No backups is a decision to revisit, not a permanent state**: fine for a dev-only cutover with nothing to lose yet, but there's no trigger built into this plan for "revisit this before it matters" — worth deciding now what that trigger is (e.g. "before any real team's retro/sprint data lives here") rather than relying on someone remembering later.
- ~~**Break-glass access**~~ — **Decided: no.** If Entra is unreachable or misconfigured, the app is unreachable for everyone, including admins, until Entra recovers. No local-credential fallback anywhere in the system — accepted risk, matches the migration's "no local passwords" goal exactly.
- **Entra-disable revocation — explicitly deferred, not built.** A user disabled in Entra is *not* automatically locked out of the app: sessions are decoupled from Entra after login (by design, see the architecture doc), and no active check (Graph polling, manual flag, or otherwise) is being added right now. Decided consciously: "leave the user active for now and look at that gap later — I don't think anyone not working with us would use this app anyway." Revisit if that assumption changes (e.g. before this app is used by anyone outside the immediate team).
- **Entra app registration ownership**: someone with tenant admin rights needs to create the app registration, set the redirect URI, and grant whatever API permissions/claims we request (at minimum `openid`, `profile`, `email`) — this is an org-IT dependency that can happen in parallel with Phase 0–1, but shouldn't be left until Phase 2 starts.
- **Group/role mapping (optional, not default)**: Entra security groups *could* map to `platform_admins` or team membership automatically via group claims, instead of assigning those in-app as today. Left out of this plan as a nice-to-have — flag if you want it folded into Phase 2 rather than kept fully manual.
- **Session/refresh-token lifetime and storage**: Supabase's client handled silent token refresh transparently; the app-level session (decoupled from Entra's own tokens, see Phase 2) needs an explicit refresh strategy — httpOnly cookie + rotating refresh token is the recommended default — worth a quick design pass before Phase 2 starts, not just an implementation detail.
- **EF Core vs. Dapper** and **SignalR vs. plain WebSockets** were decided above as recommendations, not asked as options — flag if you'd rather weigh those explicitly before Phase 0 locks them in.

## Suggested team shape for execution

This plan itself was scoped solo, but the *build* spans real architectural surface (OIDC federation + JIT provisioning + session design, SignalR group/broadcast design) and a large mechanical rewrite (data layer). Per the team-orchestration guide: worth running `architect` for a short design doc covering the Entra callback → JIT-provisioning → app-session flow specifically (that's the piece with the most ways to get subtly wrong — e.g. session fixation across the redirect, what happens on claim mismatches) before `developer` starts Phase 2, and similarly for the SignalR group/broadcast design before Phase 4. The data-layer rewrite (Phase 3) is mechanical enough for straight `developer` + `qa` once the EF Core entity shapes are settled.

---

## Deeper design → `docs/architecture/selfhost-migration.md`

That architecture pass is done. **[`docs/architecture/selfhost-migration.md`](docs/architecture/selfhost-migration.md)** takes this plan from "phased plan with decisions and open items" to implementable detail, verified against the current code rather than against this plan's own summary. It covers:

- the full Entra login → callback → JIT-provisioning → app-session sequence, with ADRs on cookie-vs-bearer session transport, completing the login inside `OnTicketReceived` instead of via a temp cookie, and the four rules that close session fixation across the redirect;
- claims-mismatch behaviour, refresh-token rotation with replay detection, and the exact `AuthExtensions.cs` rewrite;
- the SignalR design — one hub, three topic families, server-side presence, and a `Touch`-then-result-filter broadcast pattern with a complete endpoint→topic map, so no endpoint is left as a judgment call;
- EF Core entity/schema design, FK delete behaviours, the enum-casing trap, and the migration consolidation strategy;
- and what actually needs auditing once RLS is gone.

Four findings in that doc contradict or extend what's written above, and are worth reading before starting any phase:

1. `backend/Data/AppDbContext.cs` is a tombstone comment, not a live DbContext — Phase 3 writes it from scratch.
2. All four DB-touching services are registered as **singletons** (`Program.cs:31-34`) and must become scoped in the same commit as the DbContext, or they capture it.
3. The `platform_admin_allowlist` → `platform_admins` sync is a Postgres **trigger on `auth.users`** (`019:77-80`) that disappears with Supabase; it has to move into C# JIT provisioning or allowlisted admins silently stop being promoted.
4. Every existing `postgres_changes` handler is a debounced refetch that ignores the payload — which makes the Phase 4 realtime rebuild substantially smaller than this plan implies, and makes SignalR's lack of replay-on-reconnect a non-issue rather than a gap to engineer around.

It also flagged two additions beyond this plan (`users.disabled_at`, a break-glass endpoint) that needed an explicit yes/no before Phase 2 — both are now decided: **no break-glass endpoint**, and **no active revocation check for now** (deferred, not built). See the updated open items above.
