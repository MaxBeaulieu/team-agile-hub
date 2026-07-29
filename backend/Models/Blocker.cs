using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum BlockerStatus
{
    [EnumMember(Value = "Open")]       Open,
    [EnumMember(Value = "InProgress")] InProgress,
    [EnumMember(Value = "Resolved")]   Resolved,
}

[Table("blockers")]
public class Blocker : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("sprint_id")]
    public Guid? SprintId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("raised_by")]
    public Guid RaisedBy { get; set; }

    [Column("owner_id")]
    public Guid? OwnerId { get; set; }

    [Column("status")]
    public BlockerStatus Status { get; set; } = BlockerStatus.Open;

    [Column("jira_issue_id")]
    public string? JiraIssueId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
