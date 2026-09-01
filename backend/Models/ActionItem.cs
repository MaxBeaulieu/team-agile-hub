using Newtonsoft.Json.Converters;
using Newtonsoft.Json;
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

public class ActionItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Null for quick retro action items, which have no sprint.
    public Guid? SprintId { get; set; }

    public ActionItemType Type { get; set; }

    public Guid? AssigneeId { get; set; }

    public string Text { get; set; } = string.Empty;

    // SQL type `date`, not `timestamptz` (001) — Npgsql maps DateOnly <-> date natively.
    public DateOnly? DueDate { get; set; }

    public ActionItemStatus Status { get; set; } = ActionItemStatus.Open;

    public Guid? CarriedFromId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Guid? TalkingPointId { get; set; }

    // Set when the item was created from a retro card during the Discuss phase,
    // so the UI can show it on that card and group it in the wrap-up summary.
    public Guid? RetroCardId { get; set; }

    public Guid? RetroSessionId { get; set; }
}
