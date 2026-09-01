using Backend.Data;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SeatsController(AppDbContext db, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    private const int MaxNoteLength = 500;
    private const int MaxReasonLength = 500;

    private List<TeamMember>? _memberships;

    private async Task<List<TeamMember>> MyMemberships()
    {
        _memberships ??= await Auth.GetMembershipsAsync(CurrentUserId);
        return _memberships;
    }

    private async Task<string> MyDisplayName()
    {
        var name = (await MyMemberships())
            .Select(m => m.DisplayName)
            .FirstOrDefault(n => !string.IsNullOrWhiteSpace(n));

        return name
            ?? User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? "Unknown";
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    // GET api/seats
    [HttpGet]
    public async Task<IActionResult> GetSeats()
    {
        var seats = await db.Seats.AsNoTracking().OrderBy(s => s.SeatNumber).ToListAsync();

        var teams = await ResolveOccupantTeams(seats);
        var defectCounts = await OpenDefectCountsBySeat();
        var me = CurrentUserId;

        return Ok(seats.Select(s => ToDto(s, me, teams, defectCounts)));
    }

    // GET api/seats/reports?status=open
    [HttpGet("reports")]
    public async Task<IActionResult> GetDefectReports([FromQuery] string? status)
    {
        if (!await IsPlatformAdminAsync()) return Forbid();

        var wanted = status?.Trim().ToLowerInvariant();
        if (wanted is not (null or "" or "open" or "closed"))
            return BadRequest("Status must be 'open' or 'closed'.");

        IQueryable<SeatDefectReport> query = db.SeatDefectReports.AsNoTracking();

        if (!string.IsNullOrEmpty(wanted) && Enum.TryParse<SeatDefectStatus>(wanted, true, out var statusFilter))
        {
            query = query.Where(r => r.Status == statusFilter);
        }

        var reports = await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
        if (reports.Count == 0) return Ok(Array.Empty<SeatDefectReportDto>());

        var seatIds = reports.Select(r => r.SeatId).Distinct().ToList();
        var seats = await db.Seats.AsNoTracking()
            .Where(s => seatIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id);

        return Ok(reports.Select(r => ToDto(r, seats.GetValueOrDefault(r.SeatId))));
    }

    // ─── Assignment ───────────────────────────────────────────────────────────

    // POST api/seats/{id}/assign — claim an available seat, or switch your own
    // seat between permanent and floating
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> AssignSeat(Guid id, [FromBody] AssignSeatRequest req)
    {
        var seat = await FindSeat(id);
        if (seat is null) return NotFound();
        if (seat.OutOfService) return Conflict("This seat is out of service.");

        var mine = seat.OccupantId == CurrentUserId;
        if (seat.OccupantId is not null && !mine) return Conflict("This seat is already taken.");
        if (mine && seat.Assignment == req.Assignment)
            return Conflict("You already hold this seat on those terms.");

        if (!mine)
        {
            // one seat per person — give up whatever they were sitting at
            var current = await db.Seats.Where(s => s.OccupantId == CurrentUserId).ToListAsync();
            foreach (var previous in current)
            {
                Vacate(previous);
            }

            seat.OccupantId = CurrentUserId;
            seat.OccupantName = await MyDisplayName();
            seat.AssignedAt = DateTime.UtcNow;
        }

        seat.Assignment = req.Assignment;
        seat.UpdatedAt = DateTime.UtcNow;

        // One SaveChangesAsync commits the new seat and any vacated previous seat(s)
        // together — an improvement over updating each row in a separate round-trip.
        await db.SaveChangesAsync();
        return Ok(ToDto(seat, CurrentUserId));
    }

    // POST api/seats/{id}/release — give up your own seat
    [HttpPost("{id:guid}/release")]
    public async Task<IActionResult> ReleaseSeat(Guid id)
    {
        var seat = await FindSeat(id);
        if (seat is null) return NotFound();
        if (seat.OccupantId is null) return Conflict("This seat is already available.");
        if (seat.OccupantId != CurrentUserId && !await IsPlatformAdminAsync()) return Forbid();

        Vacate(seat);
        await db.SaveChangesAsync();
        return Ok(ToDto(seat, CurrentUserId));
    }

    // POST api/seats/{id}/unassign — admin removes whoever is sitting there
    [HttpPost("{id:guid}/unassign")]
    public async Task<IActionResult> UnassignSeat(Guid id)
    {
        if (!await IsPlatformAdminAsync()) return Forbid();

        var seat = await FindSeat(id);
        if (seat is null) return NotFound();
        if (seat.OccupantId is null) return Conflict("This seat is already available.");

        Vacate(seat);
        await db.SaveChangesAsync();
        return Ok(ToDto(seat, CurrentUserId));
    }

    // ─── Note ─────────────────────────────────────────────────────────────────

    // PATCH api/seats/{id}/note
    [HttpPatch("{id:guid}/note")]
    public async Task<IActionResult> UpdateNote(Guid id, [FromBody] UpdateSeatNoteRequest req)
    {
        var note = req.Note?.Trim();
        if (note?.Length > MaxNoteLength)
            return BadRequest($"Note must be {MaxNoteLength} characters or fewer.");

        var seat = await FindSeat(id);
        if (seat is null) return NotFound();

        seat.Note = string.IsNullOrEmpty(note) ? null : note;
        seat.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ToDto(seat, CurrentUserId));
    }

    // ─── Equipment ────────────────────────────────────────────────────────────

    // PATCH api/seats/{id}/equipment — flag the dock / terminal as present or gone
    [HttpPatch("{id:guid}/equipment")]
    public async Task<IActionResult> UpdateEquipment(
        Guid id, [FromBody] UpdateSeatEquipmentRequest req)
    {
        if (req.HasDock is null && req.HasTerminal is null)
            return BadRequest("Nothing to update.");

        var seat = await FindSeat(id);
        if (seat is null) return NotFound();

        // Whoever sits there can see what is on the desk; anyone else needs to be an admin.
        if (seat.OccupantId != CurrentUserId && !await IsPlatformAdminAsync()) return Forbid();

        seat.HasDock = req.HasDock ?? seat.HasDock;
        seat.HasTerminal = req.HasTerminal ?? seat.HasTerminal;
        seat.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ToDto(seat, CurrentUserId));
    }

    // ─── Defect reports ───────────────────────────────────────────────────────

    // POST api/seats/{id}/reports
    [HttpPost("{id:guid}/reports")]
    public async Task<IActionResult> ReportDefect(Guid id, [FromBody] ReportSeatDefectRequest req)
    {
        var reason = req.Reason?.Trim();
        if (string.IsNullOrEmpty(reason)) return BadRequest("A reason is required.");
        if (reason.Length > MaxReasonLength)
            return BadRequest($"Reason must be {MaxReasonLength} characters or fewer.");

        var seat = await FindSeat(id);
        if (seat is null) return NotFound();

        var report = new SeatDefectReport
        {
            SeatId = seat.Id,
            ReportedBy = CurrentUserId,
            ReporterName = await MyDisplayName(),
            Reason = reason,
            Status = SeatDefectStatus.Open,
        };

        db.SeatDefectReports.Add(report);
        await db.SaveChangesAsync();
        return Ok(ToDto(report, seat));
    }

    // POST api/seats/reports/{reportId}/close
    [HttpPost("reports/{reportId:guid}/close")]
    public async Task<IActionResult> CloseDefectReport(
        Guid reportId, [FromBody] CloseSeatDefectRequest req)
    {
        if (!await IsPlatformAdminAsync()) return Forbid();

        var report = await db.SeatDefectReports.FirstOrDefaultAsync(r => r.Id == reportId);

        if (report is null) return NotFound();
        if (report.Status == SeatDefectStatus.Closed) return Conflict("This report is already closed.");

        var resolution = req.ResolutionNote?.Trim();
        if (resolution?.Length > MaxReasonLength)
            return BadRequest($"Resolution note must be {MaxReasonLength} characters or fewer.");

        report.Status = SeatDefectStatus.Closed;
        report.ResolutionNote = string.IsNullOrEmpty(resolution) ? null : resolution;
        report.ClosedBy = CurrentUserId;
        report.ClosedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        var seat = await FindSeat(report.SeatId);
        return Ok(ToDto(report, seat));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private Task<Seat?> FindSeat(Guid id) => db.Seats.FirstOrDefaultAsync(s => s.Id == id);

    private static void Vacate(Seat seat)
    {
        seat.OccupantId = null;
        seat.OccupantName = null;
        seat.Assignment = null;
        seat.AssignedAt = null;
        seat.UpdatedAt = DateTime.UtcNow;
    }

    private static string StatusOf(Seat seat) =>
        seat.OutOfService ? "out_of_service"
        : seat.OccupantId is null ? "available"
        : seat.Assignment == SeatAssignment.Permanent ? "permanent"
        : "floating";

    /// <summary>Occupant → their first team, so the map can stripe desks by team.</summary>
    private async Task<Dictionary<Guid, (Guid Id, string Name)>> ResolveOccupantTeams(
        IEnumerable<Seat> seats)
    {
        var occupantIds = seats
            .Where(s => s.OccupantId is not null)
            .Select(s => s.OccupantId!.Value)
            .Distinct()
            .ToList();

        if (occupantIds.Count == 0) return new();

        var memberships = await db.TeamMembers.AsNoTracking()
            .Where(m => occupantIds.Contains(m.UserId))
            .OrderBy(m => m.JoinedAt)
            .ToListAsync();

        if (memberships.Count == 0) return new();

        var teamIds = memberships.Select(m => m.TeamId).Distinct().ToList();
        var teamNames = await db.Teams.AsNoTracking()
            .Where(t => teamIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        return memberships
            .GroupBy(m => m.UserId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var first = g.First();
                    return (first.TeamId, teamNames.GetValueOrDefault(first.TeamId, "Unknown"));
                });
    }

    private async Task<Dictionary<Guid, int>> OpenDefectCountsBySeat() =>
        await db.SeatDefectReports.AsNoTracking()
            .Where(r => r.Status == SeatDefectStatus.Open)
            .GroupBy(r => r.SeatId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

    private static SeatDto ToDto(
        Seat seat,
        Guid currentUserId,
        Dictionary<Guid, (Guid Id, string Name)>? teams = null,
        Dictionary<Guid, int>? defectCounts = null)
    {
        (Guid Id, string Name)? team = null;
        if (teams is not null && seat.OccupantId is not null
            && teams.TryGetValue(seat.OccupantId.Value, out var found))
            team = found;

        return new SeatDto(
            seat.Id,
            seat.SeatNumber,
            seat.Pod,
            seat.Facing,
            seat.HasDock,
            seat.HasTerminal,
            StatusOf(seat),
            seat.Note,
            seat.OccupantId,
            seat.OccupantName,
            team?.Id,
            team?.Name,
            seat.AssignedAt,
            seat.OccupantId == currentUserId,
            defectCounts?.GetValueOrDefault(seat.Id) ?? 0);
    }

    private static SeatDefectReportDto ToDto(SeatDefectReport report, Seat? seat)
    {
        var label = seat is null ? "a seat" : $"seat #{seat.SeatNumber} (pod {seat.Pod})";
        var slack =
            $":rotating_light: *Defective {label}* — reported by {report.ReporterName} " +
            $"on {report.CreatedAt:yyyy-MM-dd}\n> {report.Reason}";

        return new SeatDefectReportDto(
            report.Id,
            report.SeatId,
            seat?.SeatNumber,
            seat?.Pod,
            report.Reason,
            report.ReporterName,
            report.ReportedBy,
            report.Status,
            report.ResolutionNote,
            report.CreatedAt,
            report.ClosedAt,
            slack);
    }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record SeatDto(
    Guid Id,
    int SeatNumber,
    string Pod,
    string Facing,
    bool HasDock,
    bool HasTerminal,
    string Status,
    string? Note,
    Guid? OccupantId,
    string? OccupantName,
    Guid? OccupantTeamId,
    string? OccupantTeamName,
    DateTime? AssignedAt,
    bool IsMine,
    int OpenDefectCount);

public record SeatDefectReportDto(
    Guid Id,
    Guid SeatId,
    int? SeatNumber,
    string? Pod,
    string Reason,
    string ReporterName,
    Guid ReportedBy,
    SeatDefectStatus Status,
    string? ResolutionNote,
    DateTime CreatedAt,
    DateTime? ClosedAt,
    string SlackMessage);

public record AssignSeatRequest(SeatAssignment Assignment);
public record UpdateSeatNoteRequest(string? Note);
public record UpdateSeatEquipmentRequest(bool? HasDock, bool? HasTerminal);
public record ReportSeatDefectRequest(string? Reason);
public record CloseSeatDefectRequest(string? ResolutionNote);
