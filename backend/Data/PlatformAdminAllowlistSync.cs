using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Backend.Data;

/// <summary>
/// Moves <c>sync_platform_admin_from_allowlist</c> — a Postgres trigger on
/// <c>auth.users</c> (supabase/migrations/019_roles_and_platform_admins.sql:56-80) —
/// into C#. That trigger table disappears with Supabase, so without this the allowlist
/// would silently stop promoting anyone (architecture doc §3.7 finding 0.7).
///
/// Deliberately free-standing rather than a DI service: Phase 2 (Entra auth, not yet
/// built) owns the actual call site — <c>UserProvisioningService.ProvisionAsync</c>,
/// per architecture doc §1.1/§3.7 — and should call
/// <see cref="PromoteIfAllowlistedAsync"/> there on *every* staff login, not just the
/// first, so someone allowlisted after their first sign-in still gets promoted (§1.4).
/// Kept as a plain static method taking an <see cref="AppDbContext"/> so Phase 2 can call
/// it from its own scoped service without this needing its own DI registration.
///
/// Deliberately one-way: removing an email from the allowlist does not revoke an
/// existing <see cref="PlatformAdmin"/> row. Matches the original trigger's semantics —
/// see architecture doc §1.4, "Demotion is deliberately not implemented".
/// </summary>
public static class PlatformAdminAllowlistSync
{
    public static async Task PromoteIfAllowlistedAsync(
        AppDbContext db, Guid userId, string? email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return;
        }

        var normalizedEmail = email.Trim().ToLowerInvariant();

        var isAllowlisted = await db.PlatformAdminAllowlist
            .AnyAsync(a => a.Email == normalizedEmail, ct);

        if (!isAllowlisted)
        {
            return;
        }

        var alreadyPromoted = await db.PlatformAdmins.AnyAsync(p => p.UserId == userId, ct);
        if (alreadyPromoted)
        {
            return;
        }

        db.PlatformAdmins.Add(new PlatformAdmin { UserId = userId });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Two concurrent logins for the same brand-new user both read
            // alreadyPromoted == false and both tried to insert; the loser hits the
            // platform_admins PK. Matches the original trigger's
            // `on conflict (user_id) do nothing` — swallow, don't treat as a real error.
        }
    }
}
