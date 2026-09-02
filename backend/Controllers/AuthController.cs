using Backend.Data;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

/// <summary>
/// Temporary stand-in auth surface used until Phase 2 (Entra ID SSO) lands — see
/// SELFHOST_MIGRATION_PLAN.md. <c>POST /api/auth/dev-login</c> signs everyone in as
/// one fixed test account instead of a real identity provider: no password check, no
/// signup, no per-person identity. Not gated behind <c>ApiControllerBase</c>'s
/// <c>[Authorize]</c> — signing in has to work before there's a token to authorize.
///
/// When Phase 2 starts, replace <see cref="DevLogin"/>'s body with real Entra
/// JIT-provisioning (look up <c>entra_object_id</c>, JIT-provision on first login) —
/// nothing else here (<see cref="TokenService"/>, the JWT shape, the <c>users</c>
/// table) needs to change.
/// </summary>
[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens) : ControllerBase
{
    // Fixed id so repeated dev-logins reuse the same user row instead of piling up
    // duplicates every time someone signs in during local/dev use.
    private static readonly Guid TestUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    // POST api/auth/dev-login — stand-in for Entra ID sign-in. Always signs in as the
    // same fixed test account; JIT-provisions it on first call.
    [HttpPost("dev-login")]
    public async Task<IActionResult> DevLogin()
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == TestUserId);
        if (user is null)
        {
            user = new User
            {
                Id = TestUserId,
                Email = "test@local.dev",
                DisplayName = "Test User",
                IsAnonymous = false,
            };
            db.Users.Add(user);
        }
        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(ToResponse(user));
    }

    // POST api/auth/guest — replaces supabase.auth.signInAnonymously(): a brand-new
    // anonymous user every call, same semantics retro/join/[code] already depends on.
    [HttpPost("guest")]
    public async Task<IActionResult> Guest()
    {
        var user = new User
        {
            DisplayName = "Guest",
            IsAnonymous = true,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(ToResponse(user));
    }

    private AuthResponseDto ToResponse(User user)
    {
        var (accessToken, expiresAt) = tokens.IssueToken(user);
        return new AuthResponseDto(accessToken, expiresAt, user.Id, user.Email, user.DisplayName, user.IsAnonymous);
    }
}

public record AuthResponseDto(
    string AccessToken,
    DateTime ExpiresAt,
    Guid UserId,
    string? Email,
    string DisplayName,
    bool IsAnonymous);
