using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum EpicStatus
{
    [EnumMember(Value = "on_track")] OnTrack,
    [EnumMember(Value = "at_risk")]  AtRisk,
    [EnumMember(Value = "on_hold")]  OnHold,
    [EnumMember(Value = "done")]     Done,
}

[Table("epics")]
public class Epic : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("status")]
    public EpicStatus Status { get; set; } = EpicStatus.OnTrack;

    [Column("expected_delivery")]
    public DateOnly? ExpectedDelivery { get; set; }

    [Column("jira_issue_id")]
    public string? JiraIssueId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Reference(typeof(EpicKpi), includeInQuery: false, columnName: "epic_kpis")]
    [JsonProperty("epic_kpis")]
    public List<EpicKpi> Kpis { get; set; } = new();
}

[Table("epic_kpis")]
public class EpicKpi : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("epic_id")]
    public Guid EpicId { get; set; }

    [Column("label")]
    public string Label { get; set; } = string.Empty;

    [Column("target_value")]
    public string? TargetValue { get; set; }

    [Column("current_value")]
    public string? CurrentValue { get; set; }

    [Column("is_done")]
    public bool IsDone { get; set; }

    [Column("order")]
    public int Order { get; set; }
}
