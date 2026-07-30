using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SeatAssignment
{
    [EnumMember(Value = "permanent")] Permanent,
    [EnumMember(Value = "floating")]  Floating,
}

[Table("seats")]
public class Seat : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("seat_number")]
    public int SeatNumber { get; set; }

    [Column("pod")]
    public string Pod { get; set; } = string.Empty;

    [Column("facing")]
    public string Facing { get; set; } = string.Empty;

    [Column("has_dock")]
    public bool HasDock { get; set; } = true;

    [Column("has_terminal")]
    public bool HasTerminal { get; set; } = true;

    [Column("out_of_service")]
    public bool OutOfService { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    [Column("occupant_id")]
    public Guid? OccupantId { get; set; }

    [Column("occupant_name")]
    public string? OccupantName { get; set; }

    [Column("assignment")]
    public SeatAssignment? Assignment { get; set; }

    [Column("assigned_at")]
    public DateTime? AssignedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
