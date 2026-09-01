using Backend.Data;
using Backend.Models;
using Backend.Realtime;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class BlockersController(AppDbContext db, ILiveNotifier live) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    // ─── List ─────────────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/blockers?sprintId=&status=
    [HttpGet("api/teams/{teamId:guid}/blockers")]
    public async Task<IActionResult> GetBlockers(
        Guid teamId,
        [FromQuery] Guid? sprintId,
        [FromQuery] string? status)
    {
        if (!await IsMember(teamId)) return Forbid();

        IQueryable<Blocker> query = db.Blockers.AsNoTracking().Where(b => b.TeamId == teamId);

        if (sprintId.HasValue)
        {
            query = query.Where(b => b.SprintId == sprintId.Value);
        }

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<BlockerStatus>(status, out var statusFilter))
        {
            query = query.Where(b => b.Status == statusFilter);
        }

        return Ok(await query.OrderByDescending(b => b.CreatedAt).ToListAsync());
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/blockers
    [HttpPost("api/teams/{teamId:guid}/blockers")]
    public async Task<IActionResult> CreateBlocker(
        Guid teamId, [FromBody] CreateBlockerRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var blocker = new Blocker
        {
            TeamId       = teamId,
            SprintId     = req.SprintId,
            Title        = req.Title.Trim(),
            Description  = req.Description?.Trim(),
            RaisedBy     = CurrentUserId,
            OwnerId      = req.OwnerId,
            Status       = BlockerStatus.Open,
            JiraIssueId  = req.JiraIssueId?.Trim(),
        };

        db.Blockers.Add(blocker);
        await db.SaveChangesAsync();
        live.Touch(Topics.Blockers(teamId));
        return Ok(blocker);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    // PATCH api/teams/{teamId}/blockers/{id}
    [HttpPatch("api/teams/{teamId:guid}/blockers/{id:guid}")]
    public async Task<IActionResult> UpdateBlocker(
        Guid teamId, Guid id, [FromBody] UpdateBlockerRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var blocker = await db.Blockers.FirstOrDefaultAsync(b => b.Id == id && b.TeamId == teamId);

        if (blocker is null) return NotFound();

        if (req.Title       is not null) blocker.Title       = req.Title.Trim();
        if (req.Description is not null) blocker.Description = req.Description.Trim();
        if (req.Status      is not null) blocker.Status      = req.Status.Value;
        if (req.OwnerId     is not null) blocker.OwnerId     = req.OwnerId == Guid.Empty ? null : req.OwnerId;
        if (req.SprintId    is not null) blocker.SprintId    = req.SprintId == Guid.Empty ? null : req.SprintId;
        if (req.JiraIssueId is not null) blocker.JiraIssueId = req.JiraIssueId.Trim() == "" ? null : req.JiraIssueId.Trim();

        await db.SaveChangesAsync();
        live.Touch(Topics.Blockers(teamId));
        return Ok(blocker);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    // DELETE api/teams/{teamId}/blockers/{id}
    [HttpDelete("api/teams/{teamId:guid}/blockers/{id:guid}")]
    public async Task<IActionResult> DeleteBlocker(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var blocker = await db.Blockers.FirstOrDefaultAsync(b => b.Id == id && b.TeamId == teamId);

        if (blocker is null) return NotFound();

        db.Blockers.Remove(blocker);
        await db.SaveChangesAsync();
        live.Touch(Topics.Blockers(teamId));
        return NoContent();
    }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record CreateBlockerRequest(
    string Title,
    string? Description,
    Guid? SprintId,
    Guid? OwnerId,
    string? JiraIssueId);

public class UpdateBlockerRequest
{
    public string?        Title       { get; init; }
    public string?        Description { get; init; }
    public BlockerStatus? Status      { get; init; }
    public Guid?          OwnerId     { get; init; }
    public Guid?          SprintId    { get; init; }
    public string?        JiraIssueId { get; init; }
}
