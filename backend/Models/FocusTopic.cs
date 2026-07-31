using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum FocusTopicStatus
{
    [EnumMember(Value = "on_track")] OnTrack,
    [EnumMember(Value = "at_risk")]  AtRisk,
    [EnumMember(Value = "on_hold")]  OnHold,
    [EnumMember(Value = "done")]     Done,
}

[Table("focus_topics")]
public class FocusTopic : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("content")]
    public string? Content { get; set; }

    [Column("status")]
    public FocusTopicStatus Status { get; set; } = FocusTopicStatus.OnTrack;

    [Column("order")]
    public int Order { get; set; }

    [Reference(typeof(TalkingPoint), includeInQuery: false, columnName: "talking_points")]
    [JsonProperty("talking_points")]
    public List<TalkingPoint> TalkingPoints { get; set; } = new();
}

[Table("recurring_agenda_items")]
public class RecurringAgendaItem : BaseModel
{

    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("last_status")]
    public string? LastStatus { get; set; }

    [Column("snoozed_until_sprint_number")]
    public int? SnoozedUntilSprintNumber { get; set; }

    [Reference(typeof(TalkingPoint), includeInQuery: false, columnName: "talking_points")]
    [JsonProperty("talking_points")]
    public List<TalkingPoint> TalkingPoints { get; set; } = new();
}
