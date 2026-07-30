using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

/// <summary>
/// Session-level membership for a retro: who has joined (including anonymous
/// invite-link guests), their display name, and whether they're the host.
/// </summary>
[Table("retro_participants")]
public class RetroParticipant : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("retro_session_id")]
    public Guid RetroSessionId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [Column("is_anonymous")]
    public bool IsAnonymous { get; set; } = false;

    [Column("is_host")]
    public bool IsHost { get; set; } = false;

    [Column("joined_at")]
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
