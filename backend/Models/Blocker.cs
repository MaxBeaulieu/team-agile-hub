using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum BlockerStatus
{
    [EnumMember(Value = "Open")]       Open,
    [EnumMember(Value = "InProgress")] InProgress,
    [EnumMember(Value = "Resolved")]   Resolved,
}

public class Blocker
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TeamId { get; set; }

    public Guid? SprintId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public Guid RaisedBy { get; set; }

    public Guid? OwnerId { get; set; }

    public BlockerStatus Status { get; set; } = BlockerStatus.Open;

    public string? JiraIssueId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
