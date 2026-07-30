using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SeatDefectStatus
{
    [EnumMember(Value = "open")]   Open,
    [EnumMember(Value = "closed")] Closed,
}

[Table("seat_defect_reports")]
public class SeatDefectReport : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("seat_id")]
    public Guid SeatId { get; set; }

    [Column("reported_by")]
    public Guid ReportedBy { get; set; }

    [Column("reporter_name")]
    public string ReporterName { get; set; } = string.Empty;

    [Column("reason")]
    public string Reason { get; set; } = string.Empty;

    [Column("status")]
    public SeatDefectStatus Status { get; set; } = SeatDefectStatus.Open;

    [Column("resolution_note")]
    public string? ResolutionNote { get; set; }

    [Column("closed_by")]
    public Guid? ClosedBy { get; set; }

    [Column("closed_at")]
    public DateTime? ClosedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
