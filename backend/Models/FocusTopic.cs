using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
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

public class FocusTopic
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SprintId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Content { get; set; }

    public FocusTopicStatus Status { get; set; } = FocusTopicStatus.OnTrack;

    public int Order { get; set; }

    // No inverse navigation on TalkingPoint — see AppDbContext configuration
    // (architecture doc §3.4: keep the 13 one-directional collections as-is).
    [JsonProperty("talking_points")]
    public List<TalkingPoint> TalkingPoints { get; set; } = new();
}

public class RecurringAgendaItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TeamId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? LastStatus { get; set; }

    public int? SnoozedUntilSprintNumber { get; set; }

    [JsonProperty("talking_points")]
    public List<TalkingPoint> TalkingPoints { get; set; } = new();
}
