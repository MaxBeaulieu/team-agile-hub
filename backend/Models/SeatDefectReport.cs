using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum SeatDefectStatus
{
    [EnumMember(Value = "open")]   Open,
    [EnumMember(Value = "closed")] Closed,
}

public class SeatDefectReport
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SeatId { get; set; }

    public Guid ReportedBy { get; set; }

    public string ReporterName { get; set; } = string.Empty;

    public string Reason { get; set; } = string.Empty;

    public SeatDefectStatus Status { get; set; } = SeatDefectStatus.Open;

    public string? ResolutionNote { get; set; }

    public Guid? ClosedBy { get; set; }

    public DateTime? ClosedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
