using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Middleware;

public static class AuthExtensions
{
    /// <summary>
    /// Validates the backend's own HS256 session JWTs (see <c>TokenService</c>) —
    /// replaces Supabase Auth's OIDC/JWKS-based validation entirely. No Supabase
    /// software or config is consulted anywhere in this path anymore.
    ///
    /// Also reads the token from the <c>access_token</c> query string for requests
    /// under <c>/hub</c>, in addition to the normal <c>Authorization: Bearer</c>
    /// header — browsers can't attach custom headers to a WebSocket handshake, so
    /// SignalR's client sends the token as a query parameter instead (its documented
    /// pattern). <c>lib/live.ts</c>'s <c>accessTokenFactory</c> is the other half of
    /// this.
    /// </summary>
    public static IServiceCollection AddAppJwtAuth(
        this IServiceCollection services,
        IConfiguration config)
    {
        var signingSecret = config["Jwt:SigningSecret"];
        if (string.IsNullOrWhiteSpace(signingSecret))
        {
            throw new InvalidOperationException(
                "App auth is not configured. Set Jwt:SigningSecret (>= 32 bytes).");
        }

        var issuer = config["Jwt:Issuer"] ?? "command-center";
        var audience = config["Jwt:Audience"] ?? "command-center";

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.RequireHttpsMetadata = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingSecret)),
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = audience,
                    ValidateLifetime = true,
                    NameClaimType = ClaimTypes.NameIdentifier,
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var accessToken = ctx.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(accessToken) &&
                            ctx.HttpContext.Request.Path.StartsWithSegments("/hub"))
                        {
                            ctx.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    },
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
