using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum TeamRole
{
    [EnumMember(Value = "member")] Member,
    [EnumMember(Value = "admin")]  Admin,
}

[Table("team_members")]
public class TeamMember : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [Column("avatar_url")]
    public string? AvatarUrl { get; set; }

    [Column("role")]
    public TeamRole Role { get; set; } = TeamRole.Member;

    [Column("joined_at")]
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
