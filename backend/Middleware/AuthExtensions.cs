using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Middleware;

public static class AuthExtensions
{
    public static IServiceCollection AddSupabaseJwtAuth(
        this IServiceCollection services,
        IConfiguration config)
    {
        var supabaseUrl = config["Supabase:Url"];
        var jwtSecret = config["Supabase:JwtSecret"];

        if (string.IsNullOrWhiteSpace(supabaseUrl) && string.IsNullOrWhiteSpace(jwtSecret))
        {
            throw new InvalidOperationException(
                "Supabase auth is not configured. Set Supabase:Url (preferred) or Supabase:JwtSecret.");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    ValidateIssuer           = false,
                    ValidateAudience         = false,
                    ValidateLifetime         = true,
                    NameClaimType            = ClaimTypes.NameIdentifier,
                };

                if (!string.IsNullOrWhiteSpace(supabaseUrl))
                {
                    var authority = $"{supabaseUrl.TrimEnd('/')}/auth/v1";
                    options.Authority = authority;
                    options.MetadataAddress = $"{authority}/.well-known/openid-configuration";
                    options.RequireHttpsMetadata =
                        authority.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
                }
                else
                {
                    options.RequireHttpsMetadata = false;
                    options.TokenValidationParameters.IssuerSigningKey =
                        new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret!));
                }

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = ctx =>
                    {
                        Console.Error.WriteLine($"[JWT] {ctx.Exception.GetType().Name}: {ctx.Exception.Message}");
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();
        return services;
    }
}
