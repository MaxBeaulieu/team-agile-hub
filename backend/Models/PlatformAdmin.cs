namespace Backend.Models;

/// <summary>
/// Org-wide administrator. Distinct from <see cref="TeamRole"/>.<c>Admin</c>, which is
/// scoped to a single team: platform admins govern resources that belong to no team
/// at all (the office floor map, the desk defect queue).
///
/// Rows are promoted from <see cref="PlatformAdminAllowlist"/> by
/// <c>Backend.Data.PlatformAdminAllowlistSync.PromoteIfAllowlistedAsync</c> — deliberately
/// not self-service, since team admin is self-grantable by creating a team. That sync
/// used to be a Postgres trigger on <c>auth.users</c>
/// (supabase/migrations/019_roles_and_platform_admins.sql:56-80); it disappears with
/// Supabase and now runs from C# instead. See
/// docs/architecture/selfhost-migration.md §3.7 finding 0.7 / §1.4.
/// </summary>
public class PlatformAdmin
{
    public Guid UserId { get; set; }

    public Guid? GrantedBy { get; set; }

    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Bootstrap/allowlist table keyed by email (migration 019's rationale: an admin can be
/// designated before they've ever signed in, so there's no user id to key on yet). Plain
/// POCO — new table, no Postgrest history, EF-mapped only via
/// <c>PlatformAdminAllowlistConfiguration</c>.
/// <c>Backend.Data.PlatformAdminAllowlistSync.PromoteIfAllowlistedAsync</c> promotes a
/// matching email into <see cref="PlatformAdmin"/> on every staff login. Deliberately
/// one-way: removing a row here does not revoke an existing <see cref="PlatformAdmin"/>
/// row (matches the original trigger's semantics — see architecture doc §1.4,
/// "Demotion is deliberately not implemented").
/// </summary>
public class PlatformAdminAllowlist
{
    /// <summary>
    /// Always lowercase — enforced by the DB CHECK constraint in
    /// PlatformAdminAllowlistConfiguration (matches migration 019:32's
    /// `check (email = lower(email))`), not just application-layer discipline.
    /// </summary>
    public string Email { get; set; } = string.Empty;

    public string? Note { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}
