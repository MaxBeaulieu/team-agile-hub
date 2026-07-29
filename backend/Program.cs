using Backend.Middleware;
using Backend.Services;
using dotenv.net;
using Newtonsoft.Json.Converters;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);

// Auth � Supabase OIDC-based JWT validation (fetches JWKS automatically)
builder.Services.AddSupabaseJwtAuth(builder.Configuration);

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

// Supabase client (replaces EF Core + Npgsql)
builder.Services.AddSingleton<SupabaseService>();
builder.Services.AddSingleton<JiraEncryptionService>();

// Controllers � use Newtonsoft so supabase-csharp models serialize cleanly
builder.Services.AddControllers().AddNewtonsoftJson(options =>
{
    // Serialize all enums as their string names (e.g. "admin" not 0)
    options.SerializerSettings.Converters.Add(new StringEnumConverter());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
