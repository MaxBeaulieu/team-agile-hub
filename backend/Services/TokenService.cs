using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Backend.Models;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Services;

/// <summary>
/// Issues the backend's own HS256 session JWTs. Replaces Supabase Auth's token
/// issuance entirely — this is the only place a session token gets minted.
///
/// Temporary shape until Phase 2 (Entra ID) lands, per SELFHOST_MIGRATION_PLAN.md:
/// one long-lived token per sign-in, no separate short-lived-access +
/// rotating-refresh-token pair yet. <see cref="Jwt__StaffRefreshDays"/> /
/// <see cref="Jwt__GuestRefreshDays"/> (already wired in docker-compose.yml /
/// .env.example) are reused as this token's actual lifetime rather than a refresh
/// window. Revisit alongside Phase 2 — see AuthController's doc comment.
/// </summary>
public class TokenService(IConfiguration config)
{
    public (string AccessToken, DateTime ExpiresAt) IssueToken(User user)
    {
        var secret = config["Jwt:SigningSecret"]
            ?? throw new InvalidOperationException("Jwt:SigningSecret is not configured.");
        var issuer = config["Jwt:Issuer"] ?? "team-agile-hub";
        var audience = config["Jwt:Audience"] ?? "team-agile-hub";

        var lifetimeDays = double.Parse(user.IsAnonymous
            ? config["Jwt:GuestRefreshDays"] ?? "30"
            : config["Jwt:StaffRefreshDays"] ?? "7");
        var expiresAt = DateTime.UtcNow.AddDays(lifetimeDays);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new("is_anonymous", user.IsAnonymous ? "true" : "false"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (!string.IsNullOrWhiteSpace(user.Email))
            claims.Add(new Claim(ClaimTypes.Email, user.Email));
        if (!string.IsNullOrWhiteSpace(user.DisplayName))
            claims.Add(new Claim("name", user.DisplayName));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
