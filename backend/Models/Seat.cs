using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SeatAssignment
{
    [EnumMember(Value = "permanent")] Permanent,
    [EnumMember(Value = "floating")]  Floating,
}

public class Seat
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public int SeatNumber { get; set; }

    public string Pod { get; set; } = string.Empty;

    public string Facing { get; set; } = string.Empty;

    public bool HasDock { get; set; } = true;

    public bool HasTerminal { get; set; } = true;

    public bool OutOfService { get; set; }

    public string? Note { get; set; }

    public Guid? OccupantId { get; set; }

    public string? OccupantName { get; set; }

    public SeatAssignment? Assignment { get; set; }

    public DateTime? AssignedAt { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
