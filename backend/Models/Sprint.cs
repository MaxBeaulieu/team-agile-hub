using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SprintStatus
{
    [EnumMember(Value = "planning")]  Planning,
    [EnumMember(Value = "active")]    Active,
    [EnumMember(Value = "completed")] Completed,
}

[Table("sprints")]
public class Sprint : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("goal")]
    public string? Goal { get; set; }

    [Column("previous_goal")]
    public string? PreviousGoal { get; set; }

    [Column("champion_id")]
    public Guid? ChampionId { get; set; }

    [Column("start_date")]
    public DateTime StartDate { get; set; }

    [Column("end_date")]
    public DateTime EndDate { get; set; }

    [Column("status")]
    public SprintStatus Status { get; set; } = SprintStatus.Planning;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Reference(typeof(SprintMember), includeInQuery: false, columnName: "sprint_members")]
    [JsonProperty("sprint_members")]
    public List<SprintMember> SprintMembers { get; set; } = new();

    [Reference(typeof(SprintTraining), includeInQuery: false, columnName: "sprint_trainings")]
    [JsonProperty("sprint_trainings")]
    public List<SprintTraining> Trainings { get; set; } = new();

    [Reference(typeof(FocusTopic), includeInQuery: false, columnName: "focus_topics")]
    [JsonProperty("focus_topics")]
    public List<FocusTopic> FocusTopics { get; set; } = new();

    [Reference(typeof(ActionItem), includeInQuery: false, columnName: "action_items")]
    [JsonProperty("action_items")]
    public List<ActionItem> ActionItems { get; set; } = new();

    [Reference(typeof(Blocker), includeInQuery: false, columnName: "blockers")]
    [JsonProperty("blockers")]
    public List<Blocker> Blockers { get; set; } = new();
}
