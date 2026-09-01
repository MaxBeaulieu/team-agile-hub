using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Backend.Data;

/// <summary>
/// Lets `dotnet ef migrations add` / `dotnet ef database update` build the model without
/// booting the full ASP.NET host. Program.cs's startup path currently pulls in Supabase
/// JWT auth config (throws if unset), CORS, Swagger, etc. — none of that is relevant to
/// generating a migration, and depending on it would make schema tooling fail on a
/// machine that hasn't set every unrelated env var yet.
///
/// Only used by EF Core design-time tooling. The running app gets its AppDbContext from
/// Program.cs's own `AddDbContext` registration, which reads the real configured
/// connection string.
/// </summary>
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=team_agile_hub;Username=app;Password=app";

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention();

        return new AppDbContext(optionsBuilder.Options);
    }
}
