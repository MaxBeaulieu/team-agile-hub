using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum TeamRole
{
    [EnumMember(Value = "member")] Member,
    [EnumMember(Value = "admin")]  Admin,
}

public class TeamMember
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TeamId { get; set; }

    public Guid UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string? AvatarUrl { get; set; }

    public TeamRole Role { get; set; } = TeamRole.Member;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
