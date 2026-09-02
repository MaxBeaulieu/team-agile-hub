using Backend.Data;
using Backend.Middleware;
using Backend.Realtime;
using Backend.Services;
using dotenv.net;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Converters;

// Load environment variables: `.env` for shared/example defaults, then
// `.env.local` (gitignored, machine-specific) which overrides it — same
// precedence convention the frontend already follows via Next.js.
DotEnv.Load(options: new DotEnvOptions(
    envFilePaths: new[] { ".env", ".env.local" }
));

var builder = WebApplication.CreateBuilder(args);

// Auth — the backend's own HS256 session JWTs (see TokenService/AuthController).
// Supabase Auth is gone entirely; no OIDC/JWKS lookups anywhere in this path.
builder.Services.AddAppJwtAuth(builder.Configuration);
builder.Services.AddSingleton<TokenService>();

// CORS
var allowedOrigins = builder.Configuration["Cors:AllowedOrigins"]?.Split(',')
    ?? new[] { "http://localhost:3000" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// EF Core / Postgres — the backend's entire data layer (SupabaseService is gone; every
// controller and both AuthorizationService/RetroParticipantService take this directly).
// Scoped is AddDbContext's default lifetime, which is deliberate here: see the
// AppDbContext doc comment.
builder.Services.AddDbContext<AppDbContext>(options => options
    .UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
    .UseSnakeCaseNamingConvention());

// AuthorizationService and RetroParticipantService take AppDbContext and must be
// scoped, not singleton — a scoped AppDbContext held forever by a singleton is a
// captive dependency (throws at startup or shares one DbContext across concurrent
// requests). JiraEncryptionService has no DB dependency and stays a singleton. See
// docs/architecture/selfhost-migration.md §3.6 / finding 0.3.
builder.Services.AddScoped<AuthorizationService>();
builder.Services.AddSingleton<JiraEncryptionService>();
builder.Services.AddScoped<RetroParticipantService>();

// Realtime (Phase 4) — one hub, mapped below at /hub/live. ILiveNotifier is scoped (one
// per request, drained by the global result filter after the response is produced);
// ITopicVersionCounter and IPresenceRegistry are process-wide singletons — both are
// pure in-memory state and one of the three reasons the backend is pinned to a single
// replica (§3.6). See docs/architecture/selfhost-migration.md §2 / §3.6.
builder.Services.AddScoped<ILiveNotifier, LiveNotifier>();
builder.Services.AddSingleton<ITopicVersionCounter, TopicVersionCounter>();
builder.Services.AddSingleton<IPresenceRegistry, PresenceRegistry>();
builder.Services.AddSignalR(options =>
{
    // Ghost presence entries are caught by the client timeout firing
    // OnDisconnectedAsync, not a separate heartbeat mechanism — see §2.3. Set
    // explicitly so the defaults are visible rather than implied.
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

// Controllers — Newtonsoft stays for StringEnumConverter/DateTimeZoneHandling below,
// independent of the now-removed supabase-csharp package.
builder.Services.AddControllers(options =>
{
    // Global — no controller action calls IHubContext directly. See
    // docs/architecture/selfhost-migration.md §2.2.
    options.Filters.Add<LiveBroadcastFilter>();
}).AddNewtonsoftJson(options =>
{
    // Serialize all enums as their string names (e.g. "admin" not 0)
    options.SerializerSettings.Converters.Add(new StringEnumConverter());

    // Npgsql 6+ rejects writing a DateTime whose Kind is Unspecified/Local to a
    // `timestamptz` column, and Newtonsoft deserializes JSON dates to Kind=Local or
    // Unspecified by default — so any inbound request body carrying a date (sprint
    // start/end, action-item due date, etc.) would throw on insert without this.
    // See docs/architecture/selfhost-migration.md §3.5.
    options.SerializerSettings.DateTimeZoneHandling = Newtonsoft.Json.DateTimeZoneHandling.Utc;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient();

var app = builder.Build();

// Apply pending EF Core migrations at startup. This is what makes a fresh
// Postgres volume (or a new migration added to the codebase) actually usable
// without a manual `dotnet ef database update` step — see docker-compose.yml's
// backend healthcheck comment and docs/architecture/selfhost-migration.md §2.3.
// Not concurrency-safe across multiple replicas; one of the reasons `backend`
// is pinned to a single replica (see docker-compose.yml top-of-file comment).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<LiveHub>("/hub/live");

app.Run();
