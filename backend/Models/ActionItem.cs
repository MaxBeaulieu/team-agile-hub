using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum ActionItemType
{
    [EnumMember(Value = "retro")]    Retro,
    [EnumMember(Value = "planning")] Planning,
}

[JsonConverter(typeof(StringEnumConverter))]
public enum ActionItemStatus
{
    [EnumMember(Value = "open")]         Open,
    [EnumMember(Value = "in_progress")]  InProgress,
    [EnumMember(Value = "done")]         Done,
    [EnumMember(Value = "carried_over")] CarriedOver,
    [EnumMember(Value = "dropped")]      Dropped,
}

[Table("action_items")]
public class ActionItem : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("type")]
    public ActionItemType Type { get; set; }

    [Column("assignee_id")]
    public Guid? AssigneeId { get; set; }

    [Column("text")]
    public string Text { get; set; } = string.Empty;

    [Column("due_date")]
    public DateTime? DueDate { get; set; }

    [Column("status")]
    public ActionItemStatus Status { get; set; } = ActionItemStatus.Open;

    [Column("carried_from_id")]
    public Guid? CarriedFromId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("talking_point_id")]
    public Guid? TalkingPointId { get; set; }
}
