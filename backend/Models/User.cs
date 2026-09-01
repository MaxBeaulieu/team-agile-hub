namespace Backend.Models;

/// <summary>
/// Replaces Supabase's <c>auth.users</c> as the FK target for every table that used to
/// reference it. Two identity sources land in this one table: Entra ID staff (JIT
/// provisioned on first login, keyed by <see cref="EntraObjectId"/>) and local guests
/// (<see cref="IsAnonymous"/>, no Entra identity at all). See
/// docs/architecture/selfhost-migration.md §1.2.
///
/// Deliberately has no <c>disabled_at</c> column and no password/credential column of any
/// kind — staff credentials live entirely in Entra ID, and there is no local-account
/// disable mechanism by design (architecture doc §1.7). Do not add either back "just in
/// case"; both were proposed and explicitly rejected.
/// </summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Entra `oid` claim — stable per-user identifier. Null for guests.</summary>
    public Guid? EntraObjectId { get; set; }

    /// <summary>Entra `tid` claim. Audit only; not used in any lookup.</summary>
    public Guid? EntraTenantId { get; set; }

    /// <summary>
    /// Deliberately not unique and not a lookup key — <see cref="EntraObjectId"/> is the
    /// identity key. Null for guests.
    /// </summary>
    public string? Email { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public bool IsAnonymous { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastLoginAt { get; set; }
}
