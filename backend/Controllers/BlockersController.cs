using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class BlockersController(SupabaseService sb) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private async Task<bool> IsMember(Guid teamId)
    {
        var r = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();
        return r.Models.Any();
    }

    // ─── List ─────────────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/blockers?sprintId=&status=
    [HttpGet("api/teams/{teamId:guid}/blockers")]
    public async Task<IActionResult> GetBlockers(
        Guid teamId,
        [FromQuery] Guid? sprintId,
        [FromQuery] string? status)
    {
        if (!await IsMember(teamId)) return Forbid();

        var query = sb.Db.From<Blocker>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("created_at", Ordering.Descending);

        if (sprintId.HasValue)
            query = query.Filter("sprint_id", Operator.Equals, sprintId.Value.ToString());

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Filter("status", Operator.Equals, status);

        var result = await query.Get();
        return Ok(result.Models);
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

        var inserted = (await sb.Db.From<Blocker>().Insert(blocker)).Models.First();
        return Ok(inserted);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    // PATCH api/teams/{teamId}/blockers/{id}
    [HttpPatch("api/teams/{teamId:guid}/blockers/{id:guid}")]
    public async Task<IActionResult> UpdateBlocker(
        Guid teamId, Guid id, [FromBody] UpdateBlockerRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var blocker = (await sb.Db.From<Blocker>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (blocker is null) return NotFound();

        if (req.Title       is not null) blocker.Title       = req.Title.Trim();
        if (req.Description is not null) blocker.Description = req.Description.Trim();
        if (req.Status      is not null) blocker.Status      = req.Status.Value;
        if (req.OwnerId     is not null) blocker.OwnerId     = req.OwnerId == Guid.Empty ? null : req.OwnerId;
        if (req.SprintId    is not null) blocker.SprintId    = req.SprintId == Guid.Empty ? null : req.SprintId;
        if (req.JiraIssueId is not null) blocker.JiraIssueId = req.JiraIssueId.Trim() == "" ? null : req.JiraIssueId.Trim();

        await sb.Db.From<Blocker>().Update(blocker);
        return Ok(blocker);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    // DELETE api/teams/{teamId}/blockers/{id}
    [HttpDelete("api/teams/{teamId:guid}/blockers/{id:guid}")]
    public async Task<IActionResult> DeleteBlocker(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var blocker = (await sb.Db.From<Blocker>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (blocker is null) return NotFound();

        await sb.Db.From<Blocker>().Delete(blocker);
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
