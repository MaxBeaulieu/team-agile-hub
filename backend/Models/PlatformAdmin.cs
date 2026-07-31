using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

/// <summary>
/// Org-wide administrator. Distinct from <see cref="TeamRole"/>.<c>Admin</c>, which is
/// scoped to a single team: platform admins govern resources that belong to no team
/// at all (the office floor map, the desk defect queue).
///
/// Rows are managed by the <c>platform_admin_allowlist</c> trigger in migration 019 —
/// deliberately not self-service, since team admin is self-grantable by creating a team.
/// </summary>
[Table("platform_admins")]
public class PlatformAdmin : BaseModel
{
    [PrimaryKey("user_id", false)]
    public Guid UserId { get; set; }

    [Column("granted_by")]
    public Guid? GrantedBy { get; set; }

    [Column("granted_at")]
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;
}
