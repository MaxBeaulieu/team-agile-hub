using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SprintStatus
{
    [EnumMember(Value = "planning")]  Planning,
    [EnumMember(Value = "active")]    Active,
    [EnumMember(Value = "completed")] Completed,
}

public class Sprint
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TeamId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Goal { get; set; }

    public string? PreviousGoal { get; set; }

    public Guid? ChampionId { get; set; }

    public DateTime StartDate { get; set; }

    public DateTime EndDate { get; set; }

    public SprintStatus Status { get; set; } = SprintStatus.Planning;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonProperty("sprint_members")]
    public List<SprintMember> SprintMembers { get; set; } = new();

    [JsonProperty("sprint_trainings")]
    public List<SprintTraining> Trainings { get; set; } = new();

    [JsonProperty("focus_topics")]
    public List<FocusTopic> FocusTopics { get; set; } = new();

    [JsonProperty("action_items")]
    public List<ActionItem> ActionItems { get; set; } = new();

    [JsonProperty("blockers")]
    public List<Blocker> Blockers { get; set; } = new();
}
