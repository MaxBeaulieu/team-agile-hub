# Architecture — Self-Hosted Migration

Deeper design for `SELFHOST_MIGRATION_PLAN.md`. The plan settles *what* (EF Core,
SignalR, Microsoft.Identity.Web, drop RLS, single host, Jenkins, no backups). This
document settles *how*, for the three areas the plan itself flags as risky: the Entra
sign-in flow, the SignalR realtime rebuild, and the EF Core schema/entity design.

Everything below was verified against the code as it stands on `master`, not against
the plan's summary. Where the plan's description and the code disagree, the code wins
and the discrepancy is noted.

**Status:** Phases 0, 1 and 3 are complete; Phase 4 is in progress; Phase 6's infra files
are written. Phases 2 (auth), 5 (frontend), 7 (validation) and 8 (cutover) remain.
**Nothing in this document has ever been executed against a real database** — see §3.10,
which is the single most important caveat on everything below it, and which now carries a
decided outcome rather than an open question.

---

## 0. What the codebase actually looks like

Findings that shaped the design. These are the load-bearing ones; several contradict
what you'd assume from the plan alone.

**0.1 — Every realtime subscription is an invalidation, not a data feed.** All 17
`postgres_changes` handlers across the 4 subscribing pages do exactly one thing: call a
debounced full refetch (`scheduleRefresh` / `debouncedRefresh`, 300 ms). Not one of them
reads `payload.new`. This is the single most important fact in the whole migration — it
means the realtime replacement does not need to replicate row data, only say "something
under this topic changed." See ADR-4.

**0.2 — `backend/Data/AppDbContext.cs` was a tombstone**, not a DbContext — a 2-line
file whose comment said EF Core had been removed in favour of `supabase-csharp`. Phase 1
wrote it from scratch.

**0.3 — All four DB-touching services were registered as singletons.**
`Program.cs:31-34` registered `SupabaseService`, `AuthorizationService`,
`JiraEncryptionService`, `RetroParticipantService` with `AddSingleton`. `AppDbContext`
is scoped. Injecting it into a singleton is a captive dependency: it either throws at
startup or, worse, shares one `DbContext` across concurrent requests and produces
`InvalidOperationException: A second operation was started on this context`. Resolved in
Phase 3's final commit — see §3.6. Note this is a *different* hazard from intra-request
parallelism on a correctly-scoped context (§3.8).

**0.4 — 8 of the 11 model enums have `[EnumMember]` values whose casing differs from
the C# member name**, and 3 do not. `TeamRole.Member` serialises as `"member"`;
`RetroPhase.CheckIn` serialises as `"CheckIn"`. EF Core's `HasConversion<string>()` uses
`Enum.ToString()` and would silently be correct for 3 enums and wrong for 8. See §3.3.

**0.5 — `AuthExtensions.cs` supports a symmetric-key path, but as an `else` branch**
that only runs when `Supabase:Url` is *absent*, with `ValidateIssuer = false` and
`ValidateAudience = false` (`AuthExtensions.cs:29-30`). It is closer to "already built"
than to "ready" — the OIDC branch is deleted, not toggled, and issuer/audience
validation gets turned on.

**0.6 — Email is never read from the database.** All 9 email references in the backend
read the JWT claim (`ApiControllerBase.cs:23`, `SeatsController.cs:32`,
`RetroParticipantService.cs:93`). Nothing joins `auth.users`. Adding a `users` table
therefore required zero read-path changes; it only became the FK target.

**0.7 — `platform_admin_allowlist` is kept in sync by a Postgres trigger on
`auth.users`** (`019_roles_and_platform_admins.sql:77-80`). That trigger table
disappears with Supabase. The promotion logic must move into C# JIT provisioning or
allowlisted admins silently never get promoted. The plan does not mention this.

**0.8 — 22 columns FK to `auth.users(id)`** across 8 migration files; 54 total
`auth.users` / `auth.uid()` occurrences across 11 files.

**0.9 — `frontend/src/app/auth/callback/route.ts` exists** (the plan says it does, and
it does). `auth/login` and `auth/signup` are the only two auth pages.

**0.10 — 13 `[Reference]` collection navigations existed on the models**, all
one-directional (no inverse reference properties), each carrying a `[JsonProperty]` that
defines the wire contract the frontend parses (`retro_votes`, `team_members`, …).
Preserving that exact JSON shape was a hard constraint on the EF entity design. See §3.4.

**0.11 — Poker vote hiding and retro card hiding are already enforced in C#**
(`PokerController.cs:155-157`, `RetroController.cs:164-192`), duplicating the RLS
policies. Dropping RLS does not open those holes. See §4.2.

**0.12 — `HealthController` is a product feature, not a probe.** It serves
`GET /api/teams/{teamId}/sprints/{sprintId}/health` — the sprint health dashboard —
is `[Authorize]`, and issues ~10 DB round-trips per call. **There is no liveness or
readiness endpoint anywhere in the app.** Phase 6 needs one; see §1.9 and §5.

**0.13 — C#-side validation is inconsistent between the two retro surfaces.**
`QuickRetroController` validates mood range, card/column/name lengths and column counts;
`RetroController` validates almost none of it (`AddCard` checks only that content is
non-empty; `SubmitMood` writes the value straight through). The gap is load-bearing for
§3.9: several database constraints are the *only* thing rejecting bad input on the
sprint-retro path.

**0.14 — Presence has exactly one consumer.** `use-retro-roster.ts` is the only file
that reads Supabase presence, and it serves the two retro surfaces. `dashboard/poker` and
`dashboard/blockers` used `postgres_changes` only — there is no poker roster and no
blockers roster in the UI. This bounds the presence rebuild in §2.3.

---

## 1. Identity, sessions, and the Entra flow

### 1.1 Target shape

Two identity sources, one session format. Nothing downstream of token issuance knows or
cares which path a user came in through.

```
                    ┌──────────────────────────────────────┐
  staff  ──────────▶│ OIDC auth-code+PKCE → Entra ID       │
                    │ (Microsoft.Identity.Web / OIDC hdlr) │
                    └───────────────┬──────────────────────┘
                                    │ oid, tid, email, name
                                    ▼
                    ┌──────────────────────────────────────┐
  guest  ──────────▶│ UserProvisioningService              │──▶ public.users row
                    │  · JIT provision / update by `oid`   │
                    │  · allowlist → platform_admins        │
                    └───────────────┬──────────────────────┘
                                    ▼
                    ┌──────────────────────────────────────┐
                    │ TokenService                          │
                    │  · HS256 access JWT   (15 min)        │
                    │  · opaque refresh tok (7 d / 30 d)    │
                    └───────────────┬──────────────────────┘
                                    ▼
                     httpOnly cookies  →  every API call
                                       →  SignalR handshake
```

The app session is deliberately decoupled from Entra's own token lifecycle: Entra is
consulted at login time and never again. That is what makes the two identity paths
identical downstream — and it is also the source of the accepted gap in §1.7, which
should be read alongside this diagram rather than as a footnote to it.

### ADR-1 — Session transport: httpOnly cookies, not a bearer token in JS

**Decision.** The access token lives in an httpOnly cookie (`tah_at`). The refresh token
lives in a second httpOnly cookie (`tah_rt`) scoped to `Path=/api/auth`. The backend
reads the access token from the cookie, falling back to the `Authorization: Bearer`
header so nothing breaks if a caller (Swagger, curl, a future service client) sends one.

**Alternatives considered.**
- *Access token in memory/localStorage + `Authorization` header* (closest to today's
  `getAuthHeaders()` reading `supabase.auth.getSession()`). Rejected: this app renders
  user-authored HTML-adjacent content everywhere (retro card content, discussion notes,
  talking-point notes), which is the exact XSS surface that makes a JS-readable token
  dangerous. It also forces the SignalR client onto `accessTokenFactory`, which the
  browser WebSocket transport implements by putting the token in the **query string** —
  where it lands in Caddy's access log.
- *Both: cookie for the browser, header for everything else.* This is what we do, but
  the cookie is primary and is the only thing the frontend uses.

**Consequences.**
- `lib/api.ts` loses `getAuthHeaders()` entirely and gains `credentials: 'include'`.
  The per-request async token lookup goes away.
- The SignalR handshake authenticates for free — cookies flow on the WebSocket upgrade
  when it's same-origin. No `accessTokenFactory`, no token in a URL.
- **CSRF becomes a live concern.** Mitigations, all required:
  1. `SameSite=Lax` on `tah_at`, `SameSite=Strict` on `tah_rt`. Lax means the cookie is
     not sent on cross-site `POST`/`PATCH`/`PUT`/`DELETE`, which covers every mutating
     endpoint in the app. There are no state-changing `GET`s (verified: all 30 mutating
     routes are POST/PATCH/PUT/DELETE).
  2. CORS must **not** become permissive. In fact `AddCors` is deleted outright — see
     next point.
- **Everything becomes same-origin, in dev too.** Cookies with `SameSite=Lax` are not
  sent on cross-site XHR, so `localhost:3000 → localhost:5000` would break. Fix: add
  `rewrites()` to `next.config.ts` proxying `/api/*` and `/hub/*` to
  `BACKEND_ORIGIN` in development; Caddy does the same in production. Consequences:
  `NEXT_PUBLIC_API_URL` is deleted, `API_URL` in `lib/api.ts` becomes `''` (relative
  paths), and `Program.cs`'s entire CORS block plus the `Cors:AllowedOrigins` variable
  are deleted.

  **Timing:** the CORS block is still present after Phase 3, deliberately. It comes out
  in **Phase 5**, together with the frontend move to relative paths — removing it earlier
  breaks local dev. Not a Phase 3 oversight.

### 1.2 The `users` table

```sql
create table users (
  id              uuid primary key default gen_random_uuid(),
  entra_object_id uuid,                    -- Entra `oid`; null for guests
  entra_tenant_id uuid,                    -- Entra `tid`; audit only
  email           text,                    -- NOT unique, deliberately
  display_name    text        not null default '',
  is_anonymous    boolean     not null default false,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,

  constraint users_guest_has_no_entra_id
    check (not is_anonymous or entra_object_id is null)
);

create unique index users_entra_object_id_key
  on users (entra_object_id) where entra_object_id is not null;
create index users_email_lower_idx on users (lower(email));
```

Three choices worth stating outright:

- **`email` is indexed but not unique.** `entra_object_id` is the identity key. Email is
  descriptive data the IdP happens to give us. Making it unique creates a whole class of
  failure — a recycled address, a shared mailbox, two rows racing on first login — for
  no benefit, since nothing in the app resolves a user by email (finding 0.6). The one
  email lookup that exists (`platform_admin_allowlist`) is a lookup, not a constraint.
- **`gen_random_uuid()`, not `uuid_generate_v4()`.** Drops the `uuid-ossp` extension
  (`001_initial_schema.sql:8`); `gen_random_uuid()` is built in from PG13.
- **There is no `disabled_at` column, deliberately.** An earlier draft of this document
  proposed one as a kill switch for accounts disabled tenant-side. That was decided
  against — see §1.7. It is called out here because "why is there no way to disable a
  user?" is a reasonable question to have while reading this table, and the answer is a
  decision, not an oversight.

### 1.3 The Entra sequence, concretely

Three ASP.NET Core authentication schemes are registered:

| Scheme | Handler | Purpose |
|---|---|---|
| `"Bearer"` (default) | `AddJwtBearer` | Validates *our* HS256 token. Used by every `[Authorize]` controller and the hub. |
| `"EntraOidc"` | `AddMicrosoftIdentityWebApp` | Login-time federation only. |
| `"EntraTemp"` | `AddCookie` | Registered because the OIDC handler requires a `SignInScheme`. **Never actually written to** — see ADR-2. |

```
 1. Browser  GET  /api/auth/entra/login?next=/dashboard
              │
              │  AuthController.Login  [AllowAnonymous]
              │   · next := IsSafeLocalPath(next) ? next : "/dashboard"
              │   · unconditionally Delete("tah_at") and Delete("tah_rt")   ← ADR-3
              │   · if a tah_rt was presented, revoke its whole family
              │   · return Challenge(
              │        new AuthenticationProperties { RedirectUri = next },
              │        "EntraOidc")
              ▼
 2.  OIDC handler builds the authorize URL
       · generates PKCE verifier + code_challenge
       · generates `state`, protected by the .AspNetCore.Correlation.* cookie
       · generates `nonce`, protected by the .AspNetCore.OpenIdConnect.Nonce.* cookie
       · `next` travels *inside* the encrypted+signed `state`, never as a raw param
       302 → https://login.microsoftonline.com/{tid}/oauth2/v2.0/authorize
              │
 3.        Microsoft hosted login + Conditional Access / MFA
              │
              │  form_post (HTTP POST, cross-site)
              ▼
 4. Browser  POST /api/auth/entra/callback     ← handled by OIDC middleware, not MVC
              │   · correlation cookie consumed + deleted → state is bound to step 2
              │   · authorization code exchanged for tokens (PKCE verifier)
              │   · id_token signature validated against Entra JWKS (auto-rotating)
              │   · nonce cookie consumed → id_token bound to this login attempt
              ▼
 5.  OnTicketReceived  →  EntraSignInService.CompleteAsync(principal)
              │   · assert tid == Entra:TenantId, else 403
              │   · assert oid present, else 403
              │   · UserProvisioningService.ProvisionAsync(oid, tid, email, name)
              │   · TokenService.IssueAsync(user) → access JWT + refresh token
              │   · append Set-Cookie: tah_at, tah_rt
              │   · context.Response.Redirect(properties.RedirectUri)
              │   · context.HandleResponse()          ← skips the temp cookie sign-in
              ▼
 6. Browser  GET  /dashboard    (proxy.ts sees tah_at, lets it through)
```

Step 5 has no local account-status check. Reaching step 5 at all means Entra just
authenticated the user, which is the only authorization signal the system has by design
(§1.7).

### ADR-2 — Complete the login inside `OnTicketReceived`, not via a temp cookie

**Decision.** Hook `OnTicketReceived`, do the provisioning and token minting there, then
call `context.HandleResponse()` so the OIDC handler never signs into the `EntraTemp`
cookie scheme. The business logic itself lives in `EntraSignInService`, so the event
handler is a 3-line delegate.

**Alternative considered.** Sign into a short-lived, path-scoped `EntraTemp` cookie and
redirect to a normal MVC action `GET /api/auth/entra/complete` that does the work and
then signs the temp cookie out. More conventional, easier to unit-test in isolation.

**Why rejected.** It creates a second credential that is briefly valid on its own. That
credential is exactly the thing session-fixation attacks target, and getting its scope,
expiry, and deletion right is more subtle than the event handler it replaces. Fewer
credentials in flight beats more testable-looking code here. The service is still
directly testable; only the 3-line wiring is not.

**Consequence.** `EntraTemp` is registered but must be configured with a 5-minute expiry
and `Path=/api/auth/entra` anyway, as a belt-and-braces measure in case a future change
removes the `HandleResponse()`.

### ADR-3 — Session fixation: always issue, never upgrade

The attack this closes: an attacker plants a session cookie in the victim's browser (via
a subdomain, a stale cookie, or a shared machine), the victim then completes an Entra
login, and the attacker's pre-known cookie value ends up authenticated.

**Decision — four rules, all mandatory:**

1. **Delete before challenge.** `GET /api/auth/entra/login` emits
   `Set-Cookie: tah_at=; Max-Age=0` and the same for `tah_rt` *before* redirecting to
   Entra. If a `tah_rt` was presented, its entire refresh-token family is revoked
   server-side. There is never a "carry the old session forward" path.
2. **Fresh token values, always.** `TokenService.IssueAsync` mints a new `jti`, a new
   refresh-token `family_id`, and a new random refresh secret on every login. No value
   from before the redirect survives it.
3. **`next` never appears on the wire unprotected.** It is carried in
   `AuthenticationProperties.RedirectUri`, which the OIDC handler serialises into the
   signed+encrypted `state` parameter. An attacker cannot rewrite it into an open
   redirect. It is *additionally* re-validated as a local path when consumed — reuse the
   rule already in `proxy.ts:4-9` (`startsWith("/") && !startsWith("//")`), lifted into
   a shared `IsSafeLocalPath` helper on both sides.
4. **Correlation and nonce cookies stay on.** Do not set
   `OpenIdConnectOptions.SkipUnrecognizedRequests` or otherwise weaken the handler's
   defaults. They are what bind step 4 to step 2.

**Cookie `SameSite` interaction — the one non-obvious trap.** Step 4 is a cross-site
`POST` (`response_mode=form_post`, Microsoft's default). A `SameSite=Lax` cookie is
**not** sent on a cross-site POST, so if the correlation/nonce cookies were `Lax` the
callback would fail with "Correlation failed." ASP.NET Core's OIDC handler already sets
those cookies `SameSite=None; Secure` for exactly this reason — leave it alone, and note
that this makes **HTTPS mandatory even in dev** for the Entra path (dev tunnel or local
Caddy with a self-signed cert; the plan already flags this in Phase 0). Our own
`tah_at`/`tah_rt` cookies stay `Lax`/`Strict` because they are only ever set *after* the
redirect completes, on a same-site response.

### 1.4 Claims handling and mismatches

Match key is `oid`, never email, never `sub`. Behaviour table:

| Situation | Behaviour |
|---|---|
| First login for an `oid` | Insert `users` row. `email`, `display_name` from claims. `is_anonymous=false`. Then run allowlist→`platform_admins` promotion. New user has **zero** team memberships — the empty-state path in `MeController` must be sane (Phase 7 test). |
| Repeat login, nothing changed | Update `last_login_at` only. |
| Repeat login, **email changed** on the Entra side | Overwrite `users.email`. IdP is authoritative. Re-run allowlist promotion (the new address may be allowlisted, or the old one may have been the reason they're an admin — we do **not** demote, see below). |
| Repeat login, **display name changed** | Overwrite `users.display_name`. Note this does **not** touch `team_members.display_name`, which is per-team and user-editable in-app. That divergence is intentional and pre-existing. |
| Incoming email already on a *different* `users` row | Nothing happens. `email` is not unique (§1.2). Both rows keep their address. |
| `tid` ≠ configured tenant | Reject, 403. Guards against an authority misconfigured as `common`/`organizations`. |
| `oid` claim absent | Reject, 403, with an explicit log line. Do **not** fall back to `sub` — `sub` is pairwise per-application and would fragment identity if the app registration is ever recreated. |
| User removed/disabled in Entra | Entra refuses the login, so no *new* session is minted. An already-issued session keeps working until its refresh token expires. This is an accepted gap, not a bug — see §1.7. |

**Demotion is deliberately not implemented.** Removing someone from
`platform_admin_allowlist` does not revoke `platform_admins` — matching migration 019's
existing one-way trigger semantics. Revocation is a manual `DELETE FROM platform_admins`.
Flagging rather than silently changing behaviour; if the PM wants symmetric sync, it's a
one-line addition to `ProvisionAsync` but it changes the meaning of the allowlist.

**Implementation note.** The promotion helper is
`Backend.Data.PlatformAdminAllowlistSync.PromoteIfAllowlistedAsync(AppDbContext, Guid, string?)`,
landed in Phase 1 as a free-standing static so Phase 2 can call it from
`UserProvisioningService.ProvisionAsync` without needing its own DI registration. It must
run on **every** staff login, not just the first — that is the whole reason it moved out
of SQL (a trigger cannot cover "allowlisted after their last login, email never changes",
which migration 019 had to paper over with a one-time backfill). Its check-then-insert
carries a narrowed `23505` catch, matching the original trigger's `on conflict do
nothing`.

### 1.5 Guest path

`POST /api/auth/guest` `[AllowAnonymous]`, body `{ "displayName": "Alex" }`:

1. Insert `users` row: `is_anonymous=true`, `entra_object_id=null`, `email=null`,
   `display_name` = trimmed input (max 60, matching the existing `maxLength={60}` on the
   join form).
2. Mint the **same token shape** as staff, with `is_anonymous: "true"`.
3. Set the same two cookies. Guest refresh lifetime is 30 days (staff: 7) —
   `retro/join/[code]/page.tsx:89` walks a returning guest straight back in when a
   session plus a `localStorage` participant id both exist, and a short guest session
   would regress that UX. A 30-day anonymous credential grants nothing beyond retro
   participation, so the trade is fine.
4. Rate limit by IP (this is the only unauthenticated row-creating endpoint in the app).

There is no upgrade path from guest to staff, and there should not be — signing in
produces a different `users.id`, which is what the current code already does with
Supabase (`handleSignIn` at `retro/join/[code]/page.tsx:104-111` calls `signOut()`
first). Frontend change is mechanical: that handler becomes
`window.location.href = '/api/auth/entra/login?next=/retro/join/' + code` after clearing
`localStorage`.

### 1.6 Token contracts

**Access token** — HS256, `Jwt:SigningSecret` (≥ 32 bytes), 15 minutes:

```json
{
  "iss": "team-agile-hub",
  "aud": "team-agile-hub",
  "sub": "<users.id uuid>",
  "email": "alex@corp.com",
  "name": "Alex Roy",
  "is_anonymous": "false",
  "sid": "<refresh family_id uuid>",
  "jti": "<uuid>",
  "iat": 1756600000,
  "exp": 1756600900
}
```

`sub` is **our** `users.id`, never the Entra `oid`. `entra_object_id` never appears in an
app token. This is precisely what lets the two identity paths share one validation path:
`ApiControllerBase.CurrentUserId` (`ApiControllerBase.cs:19-21`),
`RetroParticipantService.UserIdOf` (`RetroParticipantService.cs:21-23`) and
`RetroParticipantService.IsAnonymous` (`:27-28`, which already reads `is_anonymous` as
the string `"true"`) keep working **unmodified**.

**`AuthExtensions.cs` rewrite** — `AddSupabaseJwtAuth` → `AddAppJwtAuth`:

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuerSigningKey = true,
    IssuerSigningKey         = new SymmetricSecurityKey(secretBytes),
    ValidateIssuer           = true,   // was false
    ValidIssuer              = "team-agile-hub",
    ValidateAudience         = true,   // was false
    ValidAudience            = "team-agile-hub",
    ValidateLifetime         = true,
    ClockSkew                = TimeSpan.FromSeconds(30),  // default 5 min is too loose
    NameClaimType            = "sub",
};
options.MapInboundClaims = false;      // ← see below
options.Events = new JwtBearerEvents
{
    OnMessageReceived = ctx =>
    {
        if (string.IsNullOrEmpty(ctx.Token) &&
            ctx.Request.Cookies.TryGetValue("tah_at", out var c)) ctx.Token = c;
        return Task.CompletedTask;
    }
};
```

Issuer and audience are configuration (`Jwt:Issuer`, `Jwt:Audience`), not literals —
both default to `team-agile-hub`. They are shown inline here for readability.

`MapInboundClaims = false` is a deliberate change and it is worth understanding why.
With the default (`true`), Microsoft's inbound map rewrites `name` to
`http://schemas.xmlsoap.org/…/claims/name`, which means
`RetroParticipantService.ResolveDisplayNameAsync`'s `user.FindFirstValue("name")` lookup
(`RetroParticipantService.cs:88`) returns null — it is almost certainly dead code today
and falls through to the email-local-part branch. Turning mapping off makes it work.
Nothing breaks, because every site that reads the user id already has a `?? "sub"`
fallback (`ApiControllerBase.cs:20-21`, `RetroParticipantService.cs:22-23`,
`RetroController.cs:19-20`) and every site that reads email already has a `?? "email"`
fallback (`ApiControllerBase.cs:24`, `SeatsController.cs:33`). Verified for all five call
sites; no controller change required.

**Refresh tokens** — opaque, 256-bit, hashed at rest:

```sql
create table refresh_tokens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references users(id) on delete cascade,
  token_hash     bytea       not null unique,   -- SHA-256 of the raw token
  family_id      uuid        not null,
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  replaced_by_id uuid references refresh_tokens(id),
  user_agent     text
);
create index refresh_tokens_family_idx on refresh_tokens (family_id);
create index refresh_tokens_expires_idx on refresh_tokens (expires_at);
```

`POST /api/auth/refresh` (no body; reads `tah_rt`):

1. Hash the presented token, look it up.
2. Not found → 401, clear cookies.
3. Found but `revoked_at is not null` → **replay detected**. Revoke the entire
   `family_id`, log at Warning, 401, clear cookies. This is the OAuth BCP reuse-detection
   pattern and is what makes rotation worth doing at all.
4. Expired → 401, clear cookies.
5. Otherwise: mark the row revoked, insert a successor in the same `family_id`, set
   `replaced_by_id`, mint a fresh access token, set both cookies. Sliding expiry: the
   successor's `expires_at` is `now() + lifetime`, capped at 30 days from `family` start
   so a session cannot live forever.

There is deliberately **no account-status check** in this path — no Graph call, no local
disabled flag. See §1.7; the refresh-token lifetime is the whole revocation story.

`POST /api/auth/logout`: revoke the presented token's family, clear both cookies, 204.

A `RefreshTokenCleanupService : BackgroundService` deletes rows where
`expires_at < now() - 7 days`, daily. On a single host with no backups, an unbounded
append-only table is a slow disk-space leak, and disk space is one of the two things the
plan's monitoring item cares about.

**Frontend refresh strategy.** Nothing polls. `lib/api.ts`'s `request()` gains a single
retry: on a `401`, call `POST /api/auth/refresh` once, and if it succeeds replay the
original request; if it fails, hard-navigate to `/auth/login`. Guard with a
module-level in-flight promise so ten concurrent 401s produce one refresh call. This is
~15 lines and replaces Supabase's silent-refresh machinery.

### 1.7 Accepted gaps: no break-glass path, no session revocation

Both of the plan's open items in this area have been decided, and both were decided as
*don't build it*. Recording them here in the same spirit as the plan's "no backups for
now" callout: state the gap plainly, note what would make it worth revisiting, and leave
no half-built enforcement scaffolding behind.

**No break-glass access.** Decided against. There is no local-credential fallback
anywhere in the system — no seeded emergency admin, no environment-gated bypass
endpoint, no local password path of any kind. If the Entra tenant is unreachable, the
app registration is misconfigured, or its client secret expires unnoticed, the app is
unreachable for everyone including platform admins until Entra recovers. Guest join is
technically unaffected (it never touches Entra) but grants nothing beyond retro
participation, so in practice this is a full outage.

*Implementation consequence:* `AuthController` has five endpoints, not six. Do not build
the endpoint "disabled unless a config value is set" as a compromise — an unrouted
endpoint that becomes live on one environment variable is still an attack surface, still
needs review, and is exactly the half-built scaffolding this decision is avoiding.

**No revocation of live sessions when an account is disabled in Entra.** Decided
against, for now. The app session is decoupled from Entra's token lifecycle by design
(§1.1), so the app never learns that an account was disabled tenant-side. There is no
Graph polling on refresh and no manual kill switch.

Practical effect: once an account is disabled in Entra that person can no longer *log
in* — Entra refuses it — but any session already issued keeps working until its refresh
token expires. **Maximum staleness is therefore the staff refresh-token lifetime: 7
days.** The rationale given is that the user base is people who work here and the data is
ceremony content (retro cards, sprint notes) rather than anything sensitive, so a 7-day
tail on an offboarded account does not justify the machinery.

*Implementation consequence:* **no `users.disabled_at` column.** An earlier draft of this
document proposed one; it has been removed rather than left in as a column nothing reads.
A disabled flag that no code path checks is worse than no flag at all, because it reads
like enforcement exists. When this is revisited, the whole change is: add a nullable
`users.disabled_at`, one check in the login path (§1.3 step 5), one in the refresh path
(§1.6 step 4). Small enough to defer honestly.

**Triggers for revisiting.** The plan notes that its "no backups" decision has no
built-in trigger and calls that a flaw; naming triggers here rather than repeating it:

- *Break-glass:* the first time an Entra-side change actually locks the team out, or the
  first time this host holds data whose unavailability is an incident rather than an
  inconvenience.
- *Revocation:* the first offboarding where seven days of residual access is not
  acceptable — someone leaving on bad terms, or the app starting to hold something
  beyond ceremony notes. Note the cheap partial mitigation available at any time without
  writing code: shorten the staff refresh lifetime from 7 days, trading more frequent
  re-logins for a smaller staleness window.

### 1.8 Break-glass and revocation — what this means for the deploy story

One knock-on worth stating, because it lands on DevOps rather than on the developer: with
no break-glass path, the Entra **client secret's expiry date becomes an availability
dependency**. An expired secret is a total outage with no way in. Whoever owns the app
registration (the plan's existing "Entra app registration ownership" open item) should
either put the expiry on a calendar or use certificate-based app auth with a long-lived
cert. This is not backend work and does not block any phase — but it is the most likely
way the accepted risk in §1.7 actually bites, and it is cheap to defuse.

### 1.9 Running behind the TLS-terminating proxy

Two pieces of app-side work that only exist because of the Phase 6 topology. Both are
easy to miss because they are invisible until the app is actually containerised, and
both present as somebody else's bug.

**Forwarded headers — required, or Entra login cannot work.** Caddy terminates TLS and
forwards plain HTTP to `backend:8080`, setting `X-Forwarded-Proto: https` (and `-Host`,
`-For`). ASP.NET Core ignores those headers unless explicitly told not to, so without
configuration `Request.Scheme` is `http` inside the container. Two consequences, the
first fatal:

1. The OIDC handler builds `redirect_uri=http://<host>/api/auth/entra/callback`, which
   will not match the `https://` redirect URI registered in Entra. Login fails with
   **AADSTS50011**, and the error surfaces at Microsoft rather than in our logs — which
   is why this reliably gets misdiagnosed as a Caddy or app-registration problem.
2. `Secure` cookies may be suppressed on a request the framework believes is insecure.

Fix, early in the pipeline in `Program.cs`, **before** `UseAuthentication()`:

```csharp
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
});
```

`KnownProxies`/`KnownNetworks` must be cleared (or set to the compose network range),
because the proxy's address on a Docker network is dynamic and the default localhost-only
allowlist rejects it. That is safe here specifically because the backend is not reachable
except through the proxy (§4.1) — do not copy this configuration into a context where the
app is directly exposed.

Belt and braces: `App:PublicOrigin` (e.g. `https://hub.example.com`) is configured
anyway, so anywhere the backend needs an absolute URL it can use a known-good value
rather than trusting a header.

**Liveness and readiness endpoints — they do not exist yet.** Finding 0.12:
`HealthController` is the sprint-health *dashboard*, is `[Authorize]`, and issues ~10 DB
round-trips. It must never be used as a container healthcheck. Two new endpoints:

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/health` | `[AllowAnonymous]` | 200 `{"status":"ok"}`. **No DB access.** This is the container healthcheck — it answers "is the process up," and must not fail because the database is briefly unavailable, or Docker will restart a healthy backend during a database blip. |
| `GET /api/health/ready` | `[AllowAnonymous]` | `SELECT 1`; 200 or 503. Answers "can this instance serve traffic." Use for compose ordering and for the plan's Phase 6 monitoring item. |

Neither leaks anything: no version string, no dependency detail, no request echo.

**Naming.** These cannot live in a class called `HealthController` — that name is already
taken in `Backend.Controllers` by the dashboard feature, and a second one will not
compile. Put them in `backend/Health/LivenessController.cs`.

---

## 2. Realtime — SignalR

### ADR-4 — Broadcast invalidation signals, not entity payloads

**Decision.** One server→client method, `Invalidate(topic, version)`. It carries no row
data. Clients respond by refetching the aggregate GET they already call.

**Why.** Finding 0.1: all 17 existing `postgres_changes` handlers already do exactly
this. Supabase's payload replication was never used. Rebuilding it would be work in
service of nothing.

**The stronger reason — per-recipient filtering.** Both retro cards and poker votes are
filtered per-viewer in the GET endpoints (`RetroController.cs:164-192` hides unrevealed
cards from non-authors and strips other users' votes during the Vote phase;
`PokerController.cs:155-157` hides unrevealed votes). A payload broadcast would have to
reimplement that filtering per-connection inside the hub — a brand-new, duplicated,
easy-to-get-wrong leak surface, for the exact data the product most wants hidden.
Invalidation keeps 100% of visibility logic in the one place it already lives.

**Alternatives considered.**
- *Payload broadcast (`CardAdded(card)`, `VoteCast(vote)`, …).* Rejected per above, plus
  it would require ~25 message types and matching client reducers for a UI that today
  just refetches.
- *Postgres `LISTEN/NOTIFY` + a hosted service relaying to SignalR.* This is the closest
  analogue to what Supabase Realtime actually did. Rejected: it reintroduces a
  replication-shaped dependency (triggers on 9 tables) to solve a problem the controller
  layer already knows the answer to, and every write already flows through a controller.

**Consequences.**
- **Missed messages are a non-problem.** A refetch is idempotent and self-healing. On
  `connection.onreconnected`, the client calls its existing refresh function once. There
  is no replay buffer, no message log, no sequence-gap detection — and that is a
  *correct* answer for this app, not a shortcut.
- `version` is a per-topic monotonically increasing `long` from an in-memory counter. Its
  only jobs are to let the client drop stale/duplicate invalidations and to make the
  existing 300 ms debounce provably safe. Clients ignore any `version` ≤ the last one
  they acted on.
- Invalidation is cheap enough that over-broadcasting is fine. This is already better
  than today: `dashboard/poker/page.tsx:138-140` subscribes to `poker_sessions`,
  `poker_tickets` and `poker_votes` with **no filter at all**, so every team's poker
  activity currently wakes every other team's poker page. Group-scoped invalidation
  fixes that as a side effect.

### 2.1 Hub topology

**One hub**, `LiveHub`, mapped at **`/hub/live`**. Not one hub per surface.

Hubs do not provide isolation — groups already do that. What hub count *does* control is
connection count: the JS client opens one WebSocket per `HubConnection`, and a user with
the dashboard and a retro open in two tabs would hold 2 connections with one hub and 4
with two. On a single host that matters more than the organisational tidiness of
separate hubs.

**Topics (= SignalR group names).** Deliberately identical to today's Supabase channel
names so the frontend diff stays mechanical:

| Topic | Format | Replaces | Subscribing files |
|---|---|---|---|
| Retro | `retro:{retroSessionId}` | `retro:{id}`, `quickretro:{id}`, `retro-presence:{id}` | `dashboard/retro/page.tsx`, `quickretro/[id]/page.tsx`, `use-retro-roster.ts` |
| Poker | `poker:{sprintId}` | `poker:{sprintId}` | `dashboard/poker/page.tsx` |
| Blockers | `blockers:{teamId}` | `blockers:{teamId}` | `dashboard/blockers/page.tsx` |

Sprint retros and quick retros unify onto one topic family — they are the same
`retro_sessions` row, and the split only ever existed because two pages picked different
channel names. Both pages therefore subscribe to the *same* topic string for a given
session. Poker keys on `sprintId` because that is what the page knows;
`poker_sessions.sprint_id` is unique, so `PokerSession.SprintId` is always available
server-side. That uniqueness is load-bearing for this design — see §3.1.

A static `Topics` class is the only place these strings are constructed:

```csharp
public static class Topics
{
    public static string Retro(Guid sessionId) => $"retro:{sessionId}";
    public static string Poker(Guid sprintId)  => $"poker:{sprintId}";
    public static string Blockers(Guid teamId) => $"blockers:{teamId}";
}
```

### 2.2 The broadcast wiring pattern

This is the plan's "without scattering ad-hoc `IHubContext` calls everywhere
inconsistently." The pattern is: **controllers mark, a filter sends.**

```csharp
// Scoped. Injected into controllers and services. Collects, never sends.
public interface ILiveNotifier
{
    void Touch(string topic);
    IReadOnlyCollection<string> Drain();
}
```

Controller usage — one line per mutating action, no `await`, no `IHubContext`:

```csharp
var inserted = await db.RetroCards.AddAndSaveAsync(card);
live.Touch(Topics.Retro(session.Id));
return Ok(inserted);
```

A globally-registered `IAsyncResultFilter` does the sending:

```csharp
public async Task OnResultExecutionAsync(ResultExecutingContext ctx, ResultExecutionDelegate next)
{
    var executed = await next();                       // response is produced first
    if (executed.HttpContext.Response.StatusCode is < 200 or >= 300) return;
    foreach (var topic in notifier.Drain())
        try { await hub.Clients.Group(topic).SendAsync("Invalidate", topic, versions.Next(topic)); }
        catch (Exception ex) { logger.LogError(ex, "broadcast failed for {Topic}", topic); }
}
```

Three properties this buys, each of which is a bug class avoided:

1. **Nothing broadcasts on a 4xx.** `RetroController` has ~14 `return Forbid()` /
   `BadRequest()` paths that run *after* a `Touch` would plausibly be written. The status
   check makes the ordering impossible to get wrong.
2. **Broadcast happens after commit and after the response.** A hub failure can never
   turn a successful mutation into a 500, and a client can never receive an
   `Invalidate` for a transaction that later rolled back.
3. **Set semantics.** An action that writes three rows in one topic broadcasts once.
   `RetroController.AdvancePhase` writes the session *and* bulk-updates every card; that
   is one invalidation, not two.

**Rejected: a `SaveChangesAsync` interceptor.** It cannot determine the topic — a
`RetroVote` row does not know which session it belongs to without an extra query — and
it fires inside the transaction, i.e. before commit.

**Consistency is enforced by specification, not by convention.** The complete
endpoint→topic map is below; there is no judgment call for the developer to make.

| Controller | Endpoints | Topic |
|---|---|---|
| `RetroController` | `POST …/retro`, `PATCH …/retro/{id}`, `POST …/advance`, `POST/PATCH/DELETE …/cards*`, `PUT …/votes`, `POST …/mood`, `POST …/icebreaker/roll`, `PATCH …/speaker`, `PATCH …/discuss`, `POST …/action-items` (11) | `Topics.Retro(session.Id)` |
| `QuickRetroController` | `POST /api/quickretro` *(no broadcast — nobody is subscribed yet)*, plus `…/advance`, `…/cards*`, `…/votes`, `…/mood`, `…/icebreaker/{roll,shuffle,start}`, `…/speaker`, `…/discuss`, `…/action-items` (13) | `Topics.Retro(id)` |
| `RetroInviteController` | `POST /api/retro/join/{code}`, `DELETE …/participants/{id}` (2) | `Topics.Retro(session.Id)` |
| `PokerController` | `POST …/poker`, `POST/DELETE/PATCH …/tickets*`, `POST …/vote`, `POST …/reveal`, `DELETE …/poker/{id}`, `PATCH …/current` (8) | `Topics.Poker(session.SprintId)` |
| `BlockersController` | `POST`, `PATCH`, `DELETE` (3) | `Topics.Blockers(teamId)` |
| Everything else | — | none (no subscriber exists) |

Do not add `Touch` calls to `PlanningController`, `TeamsController`, `SprintsController`,
`SeatsController`, `RetroTemplatesController` or `JiraController`. None of their data has
a live subscriber today, and speculatively wiring them creates dead paths and confusion
about what is actually load-bearing.

Note the poker topic derives from `session.SprintId`, **not** the poker session id — the
two are different Guids and the frontend keys on the sprint.

### 2.3 Presence, rebuilt server-side

Supabase's presence primitive is replaced by an in-memory registry plus two hub methods.

**Presence is retro-only.** Finding 0.14: `use-retro-roster.ts` is the sole consumer, and
there is no poker roster or blockers roster in the UI. `JoinTopic`/`LeaveTopic` still add
and remove the SignalR group for **all** topic families — `Invalidate` needs group
membership regardless — but presence is tracked and broadcast **only for `retro:*`**.
Building presence semantics for two families with no consuming UI and no natural host
concept would be dead state that still has to be cleaned up on every disconnect. It is
purely additive later: `JoinTopic` already receives the topic string, so a future poker
roster is one more branch and nothing to undo.

```csharp
public interface IPresenceRegistry            // singleton
{
    IReadOnlyList<PresenceEntry> Join(string topic, string connectionId, PresenceEntry e);
    IReadOnlyList<PresenceEntry> Leave(string topic, string connectionId);
    IReadOnlyList<PresenceEntry> Snapshot(string topic);
}

public record PresenceEntry(Guid UserId, string DisplayName, bool IsAnonymous, bool IsHost);
```

Each method returns the topic's post-mutation snapshot, which is exactly what gets
broadcast. Backing store:
`ConcurrentDictionary<string topic, ConcurrentDictionary<string connectionId, PresenceEntry>>`.

> **Correction.** An earlier draft of this section declared a fourth method,
> `IReadOnlyList<PresenceEntry> LeaveAll(string connectionId)`, commented as "returns
> affected topics' states." That signature cannot express what the comment claims — a
> flat list carries no topic identity, and `OnDisconnectedAsync` must broadcast a
> separate `Presence(topic, entries)` per topic. The fix is not a richer return type but
> removing the method: with the connection's joined topics tracked in `Context.Items`,
> `Leave` already does the job. Recorded because the defect was caught by the
> implementer, not the author.

**Multi-tab collapsing.** Entries are stored per *connection* but projected per *user*:
`Snapshot` groups by `UserId` and takes the first entry. This reproduces Supabase's
`presence: { key: userId }` behaviour exactly (`use-retro-roster.ts:41-42`), and matches
what `use-retro-roster.ts:45-54` already does client-side today. Two tabs → one roster
entry; closing one tab does not remove the user, because the other connection's entry is
still there. That last property is the one that regresses most silently — it is called
out in §6 for QA.

**Presence payloads are derived server-side, never client-supplied.** Today,
`channel.track(payload)` (`use-retro-roster.ts:61`) lets the browser assert its own
`displayName` and `isHost`, so any participant can appear as the host in everyone else's
roster. `JoinTopic(string topic)` therefore takes the topic and **nothing else**, and
builds the `PresenceEntry` from the caller's claims plus their `retro_participants` row.
**This is the one part of Phase 4 that changes behaviour rather than relocating it** —
read it as a security fix, not a port.

**Hub surface:**

```csharp
[Authorize]
public class LiveHub : Hub
{
    Task JoinTopic(string topic);     // authorize → add to group → (retro only) register
                                      // presence and broadcast Presence(topic, entries)
    Task LeaveTopic(string topic);
    override Task OnDisconnectedAsync(Exception?);
}
```

`OnDisconnectedAsync` reads the connection's joined topics and leaves each one:

```csharp
foreach (var topic in JoinedTopics())          // from Context.Items["topics"]
{
    var entries = presence.Leave(topic, Context.ConnectionId);
    await Clients.Group(topic).SendAsync("Presence", topic, entries);
}
```

`Context.Items` is not thread-safe, and is only safe here because SignalR's
`MaximumParallelInvocationsPerClient` defaults to **1**, serialising invocations on a
single connection. Do not raise that limit without revisiting this.

Server→client methods, complete list: `Invalidate(string topic, long version)` and
`Presence(string topic, PresenceEntry[] entries)`. Two methods, that is the whole
protocol.

**`JoinTopic` must authorize.** Supabase enforced channel access through RLS on the
underlying tables; with RLS gone there is nothing stopping a client from
`JoinTopic("retro:<someone-else's-guid>")`. Reuse the exact checks the GET endpoints use:

| Topic | Check |
|---|---|
| `retro:{id}` | `session.FacilitatorId == userId \|\| RetroParticipantService.IsParticipantAsync(id, userId)` — mirrors `QuickRetroController.GetAccessibleSession` (`:49-62`) |
| `poker:{sprintId}` | `AuthorizationService.IsTeamMemberAsync(userId, sprint.TeamId)` |
| `blockers:{teamId}` | `AuthorizationService.IsTeamMemberAsync(userId, teamId)` |

Unauthorized → throw `HubException("Forbidden")`; do not silently no-op, or the client
will show a permanently empty roster with no signal why. Since these services are scoped
and hub method invocations get their own DI scope, inject them per-method via
`IServiceScopeFactory` or as method parameters (`[FromServices]` is supported on hub
methods in .NET 8+). **The §3.8 intra-request parallelism hazard applies here too:** one
`AppDbContext` cannot serve concurrent queries, so do not `Task.WhenAll` several
`AppDbContext` calls inside a hub method.

**Ghost entries.** An ungraceful drop (laptop lid, killed tab) is caught by SignalR's
`ClientTimeoutInterval` (30 s default), which fires `OnDisconnectedAsync`. Do not build a
separate heartbeat — that is what the timeout already is. Set
`KeepAliveInterval = 15s` / `ClientTimeoutInterval = 30s` explicitly so the defaults are
visible.

**In-memory is the right call, with one named consequence.** Presence is ephemeral by
definition and the deployment is one backend container. If the backend is ever scaled to
2+ replicas, presence fragments and invalidation only reaches the replica that handled
the write — that is the point at which a Redis backplane becomes mandatory. Scaling out
is not in scope; this is the tripwire, and it is one of three reasons §3.6 pins the
backend to a single replica.

### 2.4 Reconnection and the client contract

```ts
const connection = new HubConnectionBuilder()
  .withUrl('/hub/live')                       // cookie auth; no accessTokenFactory
  .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
  .build()

connection.on('Invalidate', (topic, version) => { if (version > seen) scheduleRefresh() })
connection.on('Presence',   (topic, entries) => setPresence(entries))

connection.onreconnected(async () => {
  await connection.invoke('JoinTopic', topic)   // groups do NOT survive reconnect
  refreshNow()                                  // close the gap in one shot
})
```

Two things the developer must not miss:

1. **Group membership does not survive a reconnect.** A reconnected client has a new
   `ConnectionId` and belongs to no groups. `JoinTopic` must be re-invoked in
   `onreconnected`, not just in the initial `start()` handler. This is the single most
   common SignalR bug and it manifests as "realtime silently stops working after the
   laptop wakes up."
2. **Refetch once on reconnect.** That is the entire missed-message strategy, and per
   ADR-4 it is sufficient.

A small `useLiveTopic(topic, onInvalidate)` hook in `frontend/src/lib/live.ts` should own
all of the above so the 4 subscribing pages each shrink to a single hook call. The
existing 300 ms debounce in each page stays exactly as it is — the hook replaces the
channel plumbing, not the debounce.

`useRetroRoster`'s merge logic (`use-retro-roster.ts:96-123`) also stays: it reconciles
presence against the durable `retro_participants` rows and sorts host-first. Only
`useRetroPresence` — the half that talks to Supabase — is replaced.

**Proxy notes (Phase 6).** Caddy's `reverse_proxy` handles `Connection: Upgrade`
transparently — no configuration, and hand-written `header_up Connection Upgrade`
actively breaks it. Single replica means no sticky-session or `negotiate` concerns. The
one thing to watch: if any global read timeout is configured, exempt `/hub/*`, or idle
WebSocket connections get culled and it presents as "realtime randomly stops working."

---

## 3. EF Core — schema, entities, migrations

### 3.0 Sequencing: Phase 1 must end with a green build

*(Completed. Retained because it is the reasoning behind how the code got its current
shape, and the same discipline applies to any future large mechanical rewrite.)*

The naive reading of Phase 1 — "convert `Models/*.cs` from Postgrest attributes to EF
Core" — breaks the build immediately and keeps it broken for the whole of Phase 3.
`sb.Db.From<T>()` is constrained to `T : BaseModel`, and there were **266 call sites
across 19 files** (16 controllers plus `AuthorizationService` and
`RetroParticipantService`). Losing `dotnet build` for weeks costs CI signal, test
execution, bisectability, and the ability to run the app to validate the migration.

**Coexistence was the design:**

- Phase 1 left the 24 pre-existing `Models/*.cs` **untouched** — `: BaseModel` and all
  Postgrest attributes stayed. All EF mapping lives in `IEntityTypeConfiguration<T>`
  classes (§3.2), so the two never collide: Postgrest's `[Table]`/`[Column]` are in
  `Postgrest.Attributes`, and EF reads the `System.ComponentModel.DataAnnotations.Schema`
  types.
- New entities (`User`, `RefreshToken`, `PlatformAdminAllowlist`) are plain POCOs with no
  `BaseModel`.
- `AppDbContext` was registered **alongside** `SupabaseService`. Both lived in DI until
  the last Phase 3 commit.
- One central loop kept EF from mapping inherited `BaseModel` members, deleted with the
  package.
- Phase 3 flipped controllers one at a time, green after every commit. The final commit
  stripped the Postgrest attributes, dropped `: BaseModel`, deleted the `Ignore` loop,
  converted the DB-touching services from `AddSingleton` to scoped (§3.6), and removed
  the package.

Corollary that is easy to get wrong: **any change to a model's public C# surface belongs
in the phase that owns its call sites**, because controllers consume that surface. See
§3.5 for the concrete instance (`ActionItem.DueDate`).

Side benefit that paid off: because the Postgrest attributes survived Phase 1, they acted
as a *checkable spec* for the Fluent configuration. Every `[Column("...")]` was the exact
snake_case of its property name, so `UseSnakeCaseNamingConvention()` reproduced the whole
mapping and the attributes allowed diffing it rather than trusting it.

### 3.1 FK migration off `auth.users`

All 22 `references auth.users(id)` columns (finding 0.8) become
`references public.users(id)`. Delete behaviour must be chosen deliberately, because
**EF Core's default for a required reference is `Cascade`** — accepting the default would
mean deleting one user cascade-deletes every retro card they ever wrote.

| Behaviour | Columns |
|---|---|
| `Restrict` (`DeleteBehavior.Restrict`) | `retro_cards.author_id`, `retro_votes.user_id`, `poker_votes.user_id`, `mood_checkins.user_id`, `retro_participants.user_id`, `team_members.user_id`, `sprint_members.user_id`, `sprint_trainings.user_id`, `teams.created_by`, `blockers.raised_by`, `talking_point_notes.author_id`, `seat_defect_reports.reported_by` |
| `SetNull` | `sprints.champion_id`, `blockers.owner_id`, `action_items.assignee_id`, `seats.occupant_id`, `seat_defect_reports.closed_by`, `retro_sessions.facilitator_id`, `poker_sessions.facilitator_id`, `retro_templates.created_by`, `platform_admins.granted_by` |
| `Cascade` | `platform_admins.user_id`, `refresh_tokens.user_id` |

Rationale: authorship is history and should block deletion loudly; optional pointers are
metadata and can be nulled; the two cascade cases are pure per-user rows with no
independent meaning. Nothing in the app deletes users today, which is exactly why the
choice had to be encoded now rather than discovered later.

**The `sprint_id` uniqueness asymmetry is deliberate — preserve it, with a comment.**
`poker_sessions.sprint_id` is `unique` (from migration 001) and non-nullable;
`retro_sessions.sprint_id` is nullable with its unique constraint dropped by migration
011, because quick retros have no sprint. That is a product difference, not a leftover.
It is also load-bearing for §2.1: `Topics.Poker(sprintId)` is only unambiguous because
poker is 1:1 with its sprint.

**A partial unique index was added on the retro side.** Both `RetroController.CreateRetro`
and `PokerController.CreateSession` do check-then-insert with no transaction. Poker's
surviving unique constraint makes a concurrent double-create fail loudly; retro had no
backstop since 011, so two concurrent calls created two retro sessions for one sprint and
`GetSprintAndSession`'s `.FirstOrDefault()` silently orphaned one.

```sql
create unique index retro_sessions_sprint_id_key
  on retro_sessions (sprint_id) where sprint_id is not null;
```

This encodes an invariant `CreateRetro` already intends, without blocking quick retros.
Consequence: `CreateRetro` catches `23505`, re-reads, and returns the winner — preserving
the endpoint's idempotent contract, the same pattern as `EnsureParticipantAsync` (§3.8).

### 3.2 Entity configuration layout

One `IEntityTypeConfiguration<T>` per entity in `backend/Data/Configurations/`, applied
by `modelBuilder.ApplyConfigurationsFromAssembly(...)`. Not a 600-line `OnModelCreating`.
Reason: 26 entities is past the point where a single method is reviewable, and it kept
the Phase 3 controller-by-controller conversion mapping cleanly onto per-file diffs.

Config classes are named after the *entity*, not the file that declares it — several
models share a file (`PokerTicket`/`PokerVote` in `PokerSession.cs`,
`RecurringAgendaItem` in `FocusTopic.cs`), and those groupings stay as they are.

`Models/*.cs` **keep** `[JsonProperty]`, `[JsonConverter]` and `[EnumMember]` — those
define the wire contract, not the storage mapping, and the app stays on Newtonsoft.

Global conventions, set once in `OnModelCreating`:

- `UseSnakeCaseNamingConvention()` (from `EFCore.NamingConventions`) handles the
  PascalCase→snake_case column mapping for all entities, so per-property
  `HasColumnName` is only needed for the exceptions.
- The exceptions: `RetroCard.Column` → `"column"` and `PokerTicket.Order`/
  `FocusTopic.Order` → `"order"`. Both are SQL reserved words; EF quotes identifiers by
  default so they work, but be explicit.

### 3.3 Enum mapping — the highest-risk mechanical detail

Finding 0.4. One converter, applied everywhere:

```csharp
public sealed class EnumMemberConverter<T> : ValueConverter<T, string> where T : struct, Enum
{
    // both directions driven by [EnumMember(Value = "...")], falling back to the member name
}
```

Applied by a loop in `OnModelCreating` over every enum-typed property, so no entity
configuration can forget it.

**Do not use `HasConversion<string>()`.** It uses `Enum.ToString()`, which produces the
C# member name. The failure modes are inconsistent, which is what makes this dangerous:

| Enum | `[EnumMember]` value | `ToString()` | Failure with `HasConversion<string>()` |
|---|---|---|---|
| `TeamRole`, `SprintStatus`, `ActionItemType`, `ActionItemStatus`, `FocusTopicStatus`, `SeatAssignment`, `SeatDefectStatus` | lowercase / snake_case | PascalCase | **Loud** — violates the CHECK constraint, insert throws 23514 |
| `BlockerStatus`, `PokerDeckType`, `PokerSessionStatus`, `RetroPhase` | PascalCase | PascalCase | **None** — works by coincidence |

Note the 7 loud cases are the same set migration 010 already had to fix once, for the
same reason.

**That "loud" column depends entirely on the enum CHECK constraints being carried
forward.** Without them every column is plain `text`, Postgres accepts `Member`
happily, and all 11 enums fail *silently*. See §3.9.

**Verification status:** `backend.Tests/EnumMemberConverterTests.cs` asserts the exact
expected literal in both directions for all 38 members across all 11 enums, plus a
reflection cross-check that fails if a new enum or member is added without coverage. It
needs no database and passes. **This risk is retired** — the only item in §3.10 that is.

### 3.4 Navigations, and preserving the JSON contract

Finding 0.10: 13 collection navigations, all one-directional, each carrying the
`[JsonProperty]` name the frontend parses.

**Rules:**

1. **Keep the 13 collections; add no inverse reference navigations.** Configure with
   `.HasMany(x => x.Cards).WithOne().HasForeignKey(c => c.RetroSessionId)`. A
   `RetroCard.Session` back-reference would either produce a serialization cycle or
   force `ReferenceLoopHandling` config — both are regressions against a wire format
   that works today.
2. **No navigation properties at all for the `users` FKs.** Configure them as
   `.HasOne<User>().WithMany().HasForeignKey(x => x.AuthorId)` — navigationless on both
   sides. Otherwise EF adds a `User` object to every card, vote and participant, and the
   `/api/me`, `/api/retro/…` and roster payloads all silently grow a nested user blob.
3. **`AsNoTracking()` on every read.** Beyond the perf win, it prevents EF's navigation
   *fixup* from populating collections that the controller never `Include`d — which
   would otherwise make the same DTO serialise differently depending on what else the
   request happened to load. `RetroController.GetRetro` loads sessions, cards, votes,
   mood check-ins, team members, action items and participants in one request; that is
   precisely where fixup would bite.
4. `.Select("*, retro_votes(*)")` became `.Include(c => c.Votes)`. The 5 other
   `.Select("*, …")` sites mapped the same way.

### 3.5 `DateTime` and Npgsql — a guaranteed runtime trap

Npgsql 6+ maps `timestamptz` strictly: writing a `DateTime` whose `Kind` is
`Unspecified` or `Local` throws
`Cannot write DateTime with Kind=Unspecified to PostgreSQL type 'timestamp with time zone'`.

The models' `= DateTime.UtcNow` defaults are fine (`Kind=Utc`). The problem is inbound
request bodies: Newtonsoft deserialises JSON dates to `Kind=Local` or `Unspecified` by
default, so `CreateRetroActionItemRequest.DueDate`, `PlanningController`'s action-item
dates and `SprintsController`'s start/end dates would all throw on insert.

**Fix, one line in `Program.cs`:**

```csharp
options.SerializerSettings.DateTimeZoneHandling = DateTimeZoneHandling.Utc;
```

Explicitly **rejected**: `AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true)`.
It makes the error go away by silently reinterpreting local times as UTC, which corrupts
sprint boundaries rather than failing.

**`action_items.due_date` — a sequencing lesson.** The column is SQL type `date` while
`ActionItem.DueDate` is `DateTime?`. `DateOnly?` is the better final mapping. But changing
the property type changes the public C# surface, and `RetroController` assigns a
`DateTime?` to it — so making that change in Phase 1 broke the build and violated §3.0.
It was reverted to `DateTime?` with the column pinned via `.HasColumnType("date")`, which
keeps the schema correct. Flipping the property to `DateOnly?` remains available as a
tidy-up, but only in a commit that updates the call site alongside it.

### 3.6 DI lifetimes and `Program.cs`

Finding 0.3. Final registrations:

| Service | Before | Now | Why |
|---|---|---|---|
| `SupabaseService` | Singleton | **deleted** | Replaced by `AppDbContext`. |
| `AppDbContext` | — | `AddDbContext` (scoped) | EF default; correct. |
| `AuthorizationService` | Singleton | **Scoped** | Takes the DbContext. |
| `RetroParticipantService` | Singleton | **Scoped** | Takes the DbContext. |
| `JiraEncryptionService` | Singleton | Singleton | No DB dependency. |
| `ILiveNotifier` | — | Scoped | Per-request topic accumulator (Phase 4). |
| `IPresenceRegistry` | — | Singleton | Process-wide, in-memory (Phase 4). |
| `ITopicVersionCounter` | — | Singleton | Process-wide counters (Phase 4). |
| `ITokenService` | — | Scoped | Writes `refresh_tokens` (Phase 2). |
| `IUserProvisioningService` | — | Scoped | Writes `users`, `platform_admins` (Phase 2). |

**Why the lifetime change belonged in Phase 3's final stretch, not earlier:**
`AuthorizationService` and `RetroParticipantService` held `SupabaseService` until their
own call sites converted, and `SupabaseService` was a legitimate singleton. Converting
them early would have meant a scoped service depending on a singleton for no reason.

`ApiControllerBase`'s per-request memoisation (`_isPlatformAdmin`) keeps working —
controllers are already per-request.

`Program.cs` still owes, in later phases: deleting the CORS block (ADR-1, **Phase 5** —
it must not be removed before the frontend moves to relative paths);
`UseForwardedHeaders` before `UseAuthentication` (§1.9); and `AddRateLimiter` for
`POST /api/auth/guest` (Phase 2).

**Single replica, three independent reasons.** The `backend` service must not be scaled
past one instance: (1) `IPresenceRegistry` is in-memory and would fragment; (2)
invalidations only reach the replica that handled the write, with no Redis backplane;
(3) `Database.Migrate()` runs at startup and is not concurrency-safe. All three fail
silently rather than loudly, which is why this belongs in a comment in the compose file
as well as here.

### 3.7 Migration strategy

**Do not hand-write the initial migration.** Entities and configurations first, then
`dotnet ef migrations add InitialSchema`. Hand-edit the generated file only for what EF
cannot infer: the partial unique indexes (`users.entra_object_id`,
`retro_sessions.sprint_id`).

**Seeds go in `HasData`, not raw SQL.** `backend/Data/IcebreakerSeeds.cs` holds all 20
icebreakers at fixed UUIDs matching `001_initial_schema.sql:206-227`. Same for the single
`platform_admin_allowlist` bootstrap row (`019:44-46`). `HasData` keeps seeds diffable
across future migrations instead of frozen in a hand-written SQL blob.

**Numbering: keep EF's `{timestamp}_{Name}` default. Do not renumber to `001`-style.**
The timestamps are self-ordering, `dotnet ef` generates them, and hand-numbering
guarantees a merge conflict the first time two branches add a migration.

**Consolidation.** Before cutover: delete `backend/Migrations/`, drop the dev database,
regenerate a single `InitialSchema`. Safe *only* because there is no data to preserve —
a locked-in decision — and it means production starts with one clean migration and an
`__EFMigrationsHistory` table that tells the truth.

**What does not carry over from `supabase/migrations/`:**
- 22 `auth.users` FKs → retargeted (§3.1).
- Every RLS policy and `enable row level security` statement → dropped (§4).
- The `SECURITY DEFINER` helpers (`is_team_member`, `is_team_admin`,
  `is_retro_participant`, `is_platform_admin`, `can_view_retro_session`,
  `is_sprint_member`) → dropped; their logic already exists in `AuthorizationService`
  and `RetroParticipantService`.
- The `sync_platform_admin_from_allowlist` trigger on `auth.users` (`019:56-80`) →
  **moved into C#** (finding 0.7, §1.4). Runs on every staff login, not just first.
- `alter publication supabase_realtime add table …` (9 tables) → dropped; replaced by
  §2.
- All `grant`/`revoke` to `anon`/`authenticated`/`service_role` (009, 012, 019) →
  dropped; there is one DB role now.
- `epics` / `epic_kpis` (003) → already dropped by 018, do not recreate.
- `uuid-ossp` → replaced by `gen_random_uuid()`.

**What emphatically does carry over: every CHECK constraint.** See §3.9.

**Running migrations.** `db.Database.Migrate()` at backend startup. Simple, and correct
for a single-replica deployment. Two operational consequences for Phase 6: the backend
must wait for Postgres to be genuinely accepting connections (`pg_isready` healthcheck +
`depends_on: condition: service_healthy`), not merely started; and the single-replica
constraint in §3.6 is partly load-bearing for this reason.

### 3.8 Query-translation hazards

Five spots where the conversion had a real decision inside it. The last one is the most
generalisable and was not in the original design — it was found during Phase 3.

- **`RetroController.UpsertVotes`** issued one `DELETE` round-trip *per card* in a loop,
  then a bulk insert, with no transaction. In EF Core that becomes a single
  `ExecuteDeleteAsync`, wrapped with the insert in an explicit transaction. Previously a
  failure between the two lost the user's votes entirely — a real bug fix, worth
  verifying rather than assuming.
- **`RetroParticipantService.EnsureParticipantAsync`** caught a bare `Exception` to
  handle the unique-violation race on `(retro_session_id, user_id)`. Under EF Core the
  specific catch is
  `DbUpdateException { InnerException: PostgresException { SqlState: "23505" } }`.
  A bare catch would swallow genuine failures. The same pattern applies to `CreateRetro`
  (§3.1) and `PlatformAdminAllowlistSync.PromoteIfAllowlistedAsync` (§1.4).
- **`Operator.In` filters** became `.Where(x => ids.Contains(x.Id))`. Pass a `List`/array
  so Npgsql emits `= ANY(@p)` rather than expanding parameters.
- **`.Upsert(cards)`** — the bulk reveal in `AdvancePhase` — became
  `ExecuteUpdateAsync(s => s.SetProperty(c => c.IsRevealed, true))`. It bypasses the
  change tracker, fine here since nothing reads the cards afterwards in that action.
- **`Task.WhenAll` over several queries does not survive the port.** `HealthController`
  batched ~10 reads into 5 parallel `Task.WhenAll` groups, which worked because each was
  an independent PostgREST *HTTP request*. **One `AppDbContext` is not thread-safe and
  cannot serve concurrent queries** — the same batching throws
  `InvalidOperationException: A second operation was started on this context`. It was
  rewritten sequentially.

  This is a **distinct hazard from finding 0.3**, and worth keeping separate in your head:
  0.3 is a *DI lifetime* problem (a scoped context captured by a singleton), this is
  *intra-request parallelism* on a correctly-scoped context. A codebase can have the
  lifetimes perfectly right and still hit this. It applies anywhere a single context is
  shared across concurrent awaits — including hub methods (§2.3). At the time of writing
  `Task.WhenAll` appears nowhere else in the backend, so the class is closed; re-check if
  parallel query batching is reintroduced for performance.

### 3.9 Schema fidelity: constraints and column types

**Principle: a schema migration must be behaviour-preserving.** Changing what the
database accepts is a product change, and it does not belong in the same step as changing
the toolchain — because when something breaks later, nobody can tell whether it was the
migration or the rewrite.

That principle resolved two questions during Phase 1, both the same shape.

**Every CHECK constraint carries over. All of them.** The final migration has 23.

| Class | Examples | Verdict |
|---|---|---|
| Structural / multi-column | `action_items_scope_check`, `seats_assignment_consistency`, `talking_point_has_one_parent` | Carry over — nothing in C# enforces these |
| Enum value lists | `role in ('member','admin')`, `status in ('planning','active','completed')`, `type in ('retro','planning')`, … | **Carry over — these are the §3.3 safety net** |
| Simple numeric / length | `entry_mood between 1 and 5`, `capacity_score between 1 and 10`, `char_length(name) <= 100` | Carry over |

The casing differs per table and must be taken from the migration history, **not** from
the C# member names: migration 010 normalised `team_members.role`, `sprints.status`,
`action_items.type`/`status`, `focus_topics.status` to lowercase, while 001's PascalCase
survives for `blockers.status` and `poker_sessions.deck_type`/`status`.

The tempting argument for dropping the simple ones — "validation belongs in the
application layer" — is only sound when the application layer actually validates. Finding
0.13 says it doesn't, and the codebase says so in its own words. From
`QuickRetroController.cs:536-537`:

> *"Out-of-range values used to reach the database and come back as a 500 from the
> mood_checkins check constraint."*

That comment is from the recent "fix data-loss and validation bugs" pass, and that fix
added mood validation to `QuickRetroController` **only**. `RetroController.SubmitMood`
has none and writes `req.EntryMood` straight through; `sprint_members.capacity_score` has
no C# guard anywhere. So dropping `check (entry_mood between 1 and 5)` would mean a
sprint-retro mood of `99` is stored, and `HealthController` averages it into the team's
mood metric — silent corruption in a reporting surface, in an area with a track record.

The enum CHECKs matter for a different and larger reason: they are what make 7 of the 11
enums fail loudly rather than silently under a wrong value converter (§3.3).

**One deliberate addition beyond the original schema:** `retro_sessions_phase_check`.
Migration 001 declared `phase text not null default 'CheckIn'` with no CHECK. The
constraint added in Phase 1 lists exactly the eight `[EnumMember]` values, so nothing
legitimate can be blocked, and it promotes `RetroPhase` from the "silent" column of the
§3.3 table to the "loud" one. Recorded because tightening is also a behaviour change — a
good one here, but not a carry-over, and it should not later be removed as an invention.

**`[MaxLength]` must not silently become `varchar(n)`.** Unlike the Postgrest attributes,
EF Core *does* honour `System.ComponentModel.DataAnnotations.MaxLengthAttribute`. Left
alone it generates `character varying(n)` where the schema is `text`, on
`retro_sessions.name` (120) and `.icebreaker_question` (500), `retro_cards.content`
(1000) / `.column` (50) / `.group_label` (100), and `icebreakers.text` (500) /
`.category` (50) / `.source` (10).

That is a behaviour change: `RetroController.AddCard` never checks length, so a
>1000-character card that is silently accepted today would raise Postgres `22001` and
surface as a **500**, while `QuickRetroController` validates the same input and returns
400. `QuickRetroController:14-16` documents the current contract explicitly — the
attributes are "documentation only... the underlying columns are `text`."

**These are mapped to `text`.** Enforcing the documented limits at the database is a
defensible later change, but only paired with adding the missing C# validation so the
result is a 400 and not a 500.

### 3.10 DECIDED: shipping without ever executing against a database

The most important caveat in this document, and now a settled decision rather than an
open question.

**The decision.** Three options were put to the user — provision a Postgres, build a
partial SQLite translation harness, or continue without either. **Option 3 was chosen:
continue, do not provision.** Explicit and informed, in the same family as "no backups
for now" (§ plan) and the two accepted gaps in §1.7.

**Why this needed a decision at all.** An earlier draft framed this as deferred, with a
revisit trigger of "the moment anyone has Docker or Postgres access." That described an
event that was never going to occur on its own: `selfhost-developer` has no Docker,
Postgres or `psql`; `selfhost-deploy-manager` has neither `docker` nor `psql` and
correctly declined the work as outside deploy-manager scope; the architect has none
either. It was a **provisioning** problem wearing a scheduling problem's clothes, and
"someone will get to it" would have quietly aged out.

**Retired:** the enum converter risk, via the zero-infrastructure unit test (§3.3). That
was the original concern and it no longer needs a database.

**Still unverified — every item is code that has never executed:**

- **EF Core LINQ translation across all 242 Phase 3 conversions.** The largest item, and
  it was not in scope when the risk was first raised. Translation failures are
  runtime-only: a query compiles cleanly and throws
  `InvalidOperationException: The LINQ expression could not be translated` on execution.
  The compiler cannot see them, and the compiler has been the only feedback loop.
- That `InitialSchema` applies cleanly to an empty database at all.
- That the 23 CHECK constraints reject bad values at runtime. They are present in the
  model snapshot — verified by reading — but presence is not enforcement.
- That FK delete behaviours (§3.1) and the two partial unique indexes materialise.
- Everything Phase 4 adds on top, for the same reason.

**The consequence, stated as the decision requires it:**

> **Phase 7 is first integration, not validation.** It is the first time this system will
> ever run. Budget it as such. The realistic expectation is a *cluster* of failures
> surfacing together — LINQ translation errors especially — in code written weeks
> earlier by someone who has moved on to another phase. That is a different activity from
> a QA pass over working software, it will take longer than a validation pass would, and
> planning it as routine QA will produce a schedule that is wrong from the first day.

**Whoever plans Phase 7 should read this section first.** The single highest-information
event in the project is the first successful `docker compose up` followed by exercising
each converted endpoint once. Treat both as test results, not formalities.

**How to run the deferred test if a database ever appears.** Set
`ConnectionStrings__TestConnection` and `dotnet test`. ⚠️ **The fixture is destructive** —
`EnumCheckConstraintTests` calls `EnsureDeletedAsync()` and drops the database it points
at. It defaults to a *different* database name (`team_agile_hub_test`) as a guard; do not
override that with the app's connection string. The `app` role may need `CREATEDB`.

Until then, `dotnet test --filter "Category!=RequiresPostgres"` gives a clean run of
everything that does not need a database — 38/38 at time of writing. The DB-dependent
class carries `[Trait("Category", "RequiresPostgres")]` specifically so a permanently-red
suite does not train people to ignore test output.

---

## 4. RLS removal and `AuthorizationService`

### 4.1 The real reason RLS is safe to drop

The plan's argument ("it was defence in depth only, and it's duplicated in C#") is true
but understates the case. The stronger argument:

**Today the frontend holds a Postgres credential.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships
to the browser (`lib/supabase/client.ts:5`), and the browser talks to PostgREST and
Realtime directly. RLS is the *only* thing standing between that key and the tables —
which is exactly why migrations 008, 011, 012 and 019 spend so much effort on SELECT
policies (`retro_participants` needed a policy purely so Realtime sync would work,
`006:45-50`).

**After the migration, the frontend has no database credential at all.** Postgres is
reachable only from the backend container over the compose network. So:

> **Requirement:** the `postgres` service in `docker-compose.yml` must have **no `ports:`
> mapping**. Not `127.0.0.1:5432:5432` — none. This single line is the control that
> replaces every RLS policy in the repo, and it is worth calling out in the compose file
> with a comment saying so.

Two supporting choices:

- The backend connects as a non-superuser role (`app`) that owns only the `public`
  schema. Costs nothing; limits blast radius. Note that on PG15+ the explicit ownership
  (or an explicit `GRANT CREATE`) is *required*, not cosmetic — the default `CREATE`
  grant on `public` to `PUBLIC` was removed, and `Database.Migrate()` needs DDL rights.
- The `postgres` superuser password stays in `.env` and is used by nothing but the
  container's own init.

Note this means the runtime role holds DDL rights, a mild weakening accepted for
single-host simplicity. The alternative — a separate `migrator` role plus a one-shot
migration container — was considered and rejected.

### 4.2 What actually needs auditing

Mapping every dropped policy to its C# counterpart:

| Dropped policy | C# equivalent | Status |
|---|---|---|
| `see revealed or own retro cards` (011) | `RetroController.cs:164-166`, `QuickRetroController` equivalent | ✅ exists |
| `see own vote or revealed votes` (poker, 001) | `PokerController.cs:155-157` | ✅ exists |
| retro vote hiding during Vote phase | `RetroController.cs:188-192` | ✅ exists |
| `is_team_member` gates (teams, sprints, blockers, action items, focus topics) | `AuthorizationService.IsTeamMemberAsync` via `ApiControllerBase` | ✅ exists |
| `is_team_admin` gates (sprints CRUD, team update/delete, membership) | `ApiControllerBase.IsTeamAdminAsync` | ✅ exists |
| `is_platform_admin` gates (seats, defect reports) | `ApiControllerBase.IsPlatformAdminAsync` | ✅ exists |
| `is_retro_participant` / `can_view_retro_session` (008, 011) | `RetroController.IsMemberOrParticipant`, `QuickRetroController.GetAccessibleSession` | ✅ exists |
| `is_sprint_member` (008) | **no C# equivalent** | ⚠️ see below |

**The one gap.** `is_sprint_member()` existed in SQL and has no counterpart in
`AuthorizationService`. In practice every path that would have used it goes through the
*team* check instead (`RetroController.GetSessionById` verifies sprint→team, then
`IsMemberOrParticipant` checks team membership), and team membership is a superset of
sprint membership in this data model — `sprint_members` rows are always created for
people who are already `team_members`. So the gap is theoretical. **But it is exactly
where a hole would hide, and it is the thing Phase 7's "confirm `AuthorizationService`'s
permission checks still hold with zero RLS backing them up" should focus on.** Do not
add an `IsSprintMemberAsync` speculatively; verify the superset assumption instead, and
add it only if a counterexample turns up.

**Also worth a look during that audit:** `RetroController.AddCard` and `UpdateCard` check
`IsMemberOrParticipant` *after* `GetSessionById`, which is fine, but `UpdateCard`'s
`DiscussionNotes` branch lets any participant edit notes on any card in the session. That
is intended ("live collaborative notes"), but it was previously *also* constrained by the
`authors can update their retro cards` RLS policy, which would have blocked it at the DB
layer. In other words, the C# and SQL layers disagreed and the C# layer won because the
backend used the service role. Nothing changes behaviourally — but the disagreement is
worth recording so nobody "fixes" it later by tightening the C# check.

---

## 5. File and module plan

Remaining (backend):

```
backend/Auth/                     ← Phase 2
  AuthController.cs               login, callback wiring, refresh, logout, guest  (5 endpoints)
  TokenService.cs                 access JWT + refresh token issue/rotate/revoke
  EntraSignInService.cs           OnTicketReceived logic: claims → user → cookies
  UserProvisioningService.cs      JIT provision/update; calls PlatformAdminAllowlistSync
  CookieNames.cs / AuthCookies.cs cookie write/clear helpers, one place for the flags
  SafePath.cs                     shared IsSafeLocalPath (mirrors proxy.ts:4-9)
  RefreshTokenCleanupService.cs   BackgroundService
backend/Health/                   ← Phase 6 dependency
  LivenessController.cs           GET /api/health, GET /api/health/ready  (§1.9)
                                  — NOT named HealthController; that name is taken
```

Done (backend): `backend/Data/` (`AppDbContext`, `AppDbContextFactory`,
`Configurations/*.cs`, `Converters/EnumMemberConverter.cs`,
`PlatformAdminAllowlistSync.cs`), `backend/Migrations/`, the three new models, all 24
existing models converted, all 16 controllers plus both services converted,
`SupabaseService.cs` and the `supabase-csharp` package removed. Phase 4's
`backend/Realtime/` (`Topics`, `ITopicVersionCounter`/`TopicVersionCounter`,
`ILiveNotifier`/`LiveNotifier`, `LiveBroadcastFilter`) is in place with `LiveHub` and
`IPresenceRegistry` in progress.

Remaining (frontend): `src/lib/live.ts` (`useLiveTopic` hook + shared `HubConnection`)
and `src/lib/auth.ts` (thin `me()` / `logout()` helpers) are new. Changed:
`src/lib/api.ts` (cookies + 401-retry), `src/proxy.ts`,
`src/components/retro/use-retro-roster.ts`, the 4 subscribing pages,
`src/app/auth/login/page.tsx`, `next.config.ts` (dev `rewrites()` — `output: 'standalone'`
is already in), `package.json` (drop 2 Supabase packages, add `@microsoft/signalr`).
Deleted: `src/lib/supabase/`, `src/app/auth/signup/`, `src/app/auth/callback/`.

**One `proxy.ts` decision worth stating:** the Next.js middleware should check for the
*presence* of `tah_at` and nothing more — it must not verify the signature (that would
require the signing secret in the frontend container) and it must not call the backend
(that adds a round-trip to every navigation). It is a UX redirect, not a security
boundary; the security boundary is `[Authorize]` on the API. Today's
`supabase.auth.getUser()` call in `proxy.ts:46-48` is a network round-trip on every
request and this removes it. Consequence: an expired-but-present cookie lets the
navigation through, and the page's first API call 401s and triggers the refresh-or-login
path from §1.6. That is the correct division of labour.

---

## 6. Risks and QA focus

Ordered by "most likely to be discovered late and hurt."

1. **Everything in §3.10 — and Phase 7 is first integration, not validation.** The data
   layer has never run. The first execution against a real database is the
   highest-information event in this project: treat the first `docker compose up` and the
   first exercise of each converted endpoint as test results, not formalities. Expect a
   cluster of LINQ translation failures; they are runtime-only and nothing so far could
   have caught them. Plan the schedule around discovery, not confirmation.
2. **Enum casing (§3.3).** The converter itself is now unit-tested and passing. What
   remains is whether the CHECK constraints *enforce* at runtime. Exercise at least one
   write per enum: create a team (`TeamRole`), change sprint status, create and complete
   an action item, move a focus topic through all four statuses, assign a seat, file and
   close a seat defect report. Also assert the database **rejects** an out-of-range value.
3. **Multi-tab presence collapsing (§2.3).** Open the same retro in three tabs as one
   user, close one: the roster must still show that user. Then close all three: they must
   disappear within ~30 s. Then repeat with two different users in two tabs each.
4. **SignalR group loss on reconnect (§2.4).** Kill the network for 60 s with a retro
   open, restore it, then have a second user add a card. The first user must see it. This
   fails silently if `JoinTopic` is not re-invoked in `onreconnected`, and no short-lived
   manual test will catch it.
5. **Forwarded headers behind the proxy (§1.9).** Blocks *all* Entra testing once the
   stack is containerised, and misdirects: the failure is **AADSTS50011** raised at
   Microsoft, so it looks like a Caddy or app-registration problem rather than a missing
   `UseForwardedHeaders`. Verify the first containerised login end to end before
   debugging anything else in Phase 6.
6. **Validation gaps now that constraints are the only guard (§3.9, finding 0.13).**
   Submit an out-of-range mood (`99`) and an over-long retro card through the **sprint
   retro** path, not just quick retro. Both should be rejected. If either succeeds, a
   CHECK constraint or column type did not carry over.
7. **`DateTime` Kind (§3.5).** Create a sprint with explicit start/end dates and an
   action item with a due date, through the UI. These throw at insert if the Newtonsoft
   setting is missed.
8. **First-login JIT provisioning (§1.4).** A brand-new Entra user with zero team
   memberships must land on a sane dashboard empty state, not a crash. `MeController`
   returns an empty `Teams` list and `displayName ?? CurrentUserEmail ?? "Unknown"` —
   verify the frontend handles all three.
9. **Guest → staff transition (§1.5).** Join a retro as a guest, then hit "Sign in" on
   the join page and complete Entra login. Expect: a *second* participant row under a
   different user id, the guest's cards still attributed to the guest identity. That is
   correct behaviour, not a bug — but confirm it is the intended UX with the PM, because
   it is visible to users.
10. **Disabled Entra account — verify the accepted gap, don't file it as a bug (§1.7).**
    Disable an account tenant-side and confirm a *fresh login* is refused. Then confirm
    that a session issued **before** the disable keeps working, and record that as
    expected. There is no revocation mechanism by design.
11. **CSRF / SameSite (ADR-1).** Verify that a cross-origin `fetch` with
    `credentials: 'include'` to a mutating endpoint is rejected, and that the Entra
    callback (cross-site POST) still succeeds. These pull in opposite directions and are
    why the cookie flags differ between our cookies and the handler's.
12. **`JoinTopic` authorization (§2.3).** Attempt `JoinTopic('retro:<foreign-guid>')`
    from the browser console. Must throw, not silently succeed. Also confirm a client
    cannot assert its own `isHost` — the hub takes a topic string and nothing else.
13. **Vote-write transaction (§3.8).** Cast a full vote budget, confirm all votes land;
    the delete-then-insert must be atomic.
14. **Healthcheck points at `/api/health`, not the dashboard (§1.9, finding 0.12).**
    Confirm the compose healthcheck does not call
    `/api/teams/{id}/sprints/{id}/health` — that endpoint is `[Authorize]` and would
    both always fail and hammer the database.
15. **Health dashboard under load (§3.8).** `HealthController` was rewritten from
    parallel to sequential queries. Confirm it still returns, and watch its latency —
    ~10 sequential round-trips is the trade that was made for correctness.

---

## 7. Decisions resolved, and what's still outstanding

### Resolved — all three as "don't build it"

- **Break-glass access: decided against.** No local-credential fallback of any kind. If
  Entra is unreachable the app is unreachable, admins included, until Entra recovers.
  Full reasoning in §1.7; the knock-on for the app-registration owner is in §1.8.
- **Revocation on tenant-side disable: decided against, for now.** No Graph polling, no
  `users.disabled_at` column, no kill switch. An already-issued session survives up to
  the 7-day staff refresh lifetime. §1.7 has the revisit trigger. **The `disabled_at`
  column was removed rather than left in unread** — do not add it back "just in case."
- **Database provisioning for verification: decided against** (§3.10). Ship without
  executing; Phase 7 absorbs the consequence as first integration.

The first two close the corresponding open items in `SELFHOST_MIGRATION_PLAN.md`.

### Resolved during Phases 1, 3 and 4

- **Coexistence over a clean break** (§3.0) — a green build was maintained throughout.
- **All CHECK constraints carry over; `[MaxLength]` maps to `text`** (§3.9). One
  deliberate addition: `retro_sessions_phase_check`.
- **`ActionItem.DueDate` stays `DateTime?` with `HasColumnType("date")`** (§3.5).
- **`PlatformAdminAllowlistSync` is a free-standing static in `backend/Data/`** — its
  call site moves to `UserProvisioningService` in Phase 2 (§1.4).
- **Partial unique index added on `retro_sessions.sprint_id`** (§3.1).
- **`Task.WhenAll` batching does not survive the port** (§3.8) — found during Phase 3,
  not anticipated by this document.
- **`EFCore.NamingConventions` 10.0.1 confirmed for .NET 10.**
- **Presence is retro-only; `LeaveAll` deleted from `IPresenceRegistry`** (§2.3) — the
  second of these was a defect in this document, caught by the implementer.

### Still outstanding — needs someone else

- **Entra app registration (org IT) — on the critical path for Phase 2.** Single-tenant,
  redirect URI `https://<host>/api/auth/entra/callback`, `response_mode=form_post`,
  scopes `openid profile email`. Lead time is not ours to control, so this request should
  go out regardless of build order. Plus the secret-expiry point from §1.8.
- **Guest → staff produces a new identity (§1.5, QA item 9).** Pre-existing behaviour,
  worth explicit PM confirmation now that it is being reimplemented rather than inherited.
- **Platform-admin demotion is not implemented (§1.4).** Matches migration 019's one-way
  semantics. If symmetric sync is wanted, say so before Phase 2.
- **`Microsoft.Identity.Web` on .NET 10.** The project targets `net10.0`. Verify a
  compatible package version exists before Phase 2. Only `AddMicrosoftIdentityWebApp` is
  used — none of the token cache or downstream-API surface — so the fallback if the
  package lags is the plain `Microsoft.AspNetCore.Authentication.OpenIdConnect` handler
  it wraps, with no design change to anything above.

---

## Appendix A — Infra contract (Phase 6 quick reference)

Consolidated from §1.9, §2.1, §2.4, §3.6, §3.7 and §4.1 so the compose/Caddy work has one
place to check against.

| Item | Value |
|---|---|
| Backend internal port | `8080` (`ASPNETCORE_HTTP_PORTS=8080`), HTTP only — TLS ends at Caddy |
| Frontend internal port | `3000`, plus `HOSTNAME=0.0.0.0` (standalone binds loopback otherwise) |
| Postgres | `5432`, **no `ports:` mapping at all** (§4.1) |
| Routing | `/api/*` → backend · `/hub/*` → backend · `/*` → frontend (catch-all last) |
| SignalR hub path | `/hub/live` |
| WebSocket upgrade | Automatic in Caddy; do not hand-write `header_up Connection Upgrade` |
| Sticky sessions | Not needed — single replica. Exempt `/hub/*` from any global read timeout. |
| Backend replicas | **Exactly 1** — three reasons, all silent failures (§3.6) |
| Healthcheck | `GET /api/health` (§1.9). **Never** `/api/teams/{id}/sprints/{id}/health` |
| Startup ordering | `pg_isready` healthcheck + `depends_on: condition: service_healthy` (§3.7) |
| TLS | Mandatory — the Entra flow cannot work over HTTP (ADR-3) |
| Base image caveat | `aspnet:10.0` has no `curl`/`wget`; chiseled variants have no shell at all |

Backend environment: `ConnectionStrings__DefaultConnection`, `Jwt__SigningSecret`,
`Jwt__Issuer`, `Jwt__Audience`, `Jwt__AccessTokenMinutes`, `Jwt__StaffRefreshDays`,
`Jwt__GuestRefreshDays`, `Entra__TenantId`, `Entra__ClientId`, `Entra__ClientSecret`,
`App__PublicOrigin`, `ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_HTTP_PORTS`.

Frontend environment: `PORT`, `HOSTNAME`, `NODE_ENV`, and `BACKEND_ORIGIN` **in dev
only** (in production Caddy routes `/api` and `/hub` before they reach Next, so the
rewrites never fire).

Deleted relative to the plan's Phase 6 list: `Cors__AllowedOrigins` (removed in Phase 5
under ADR-1), `NEXT_PUBLIC_API_URL`, and all `Supabase__*` / `NEXT_PUBLIC_SUPABASE_*`.

**First bring-up is a test, not a formality.** Per §3.10, nothing here has ever executed
against Postgres. The first time this stack starts, record whether `InitialSchema` applies
cleanly — and if a `postgres` container is up, `dotnet test` against it costs minutes and
closes the largest open risk in the migration.
