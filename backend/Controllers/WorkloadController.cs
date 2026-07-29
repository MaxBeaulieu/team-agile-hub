using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class WorkloadController(SupabaseService sb) : ControllerBase
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

    // GET api/teams/{teamId}/workload
    [HttpGet("api/teams/{teamId:guid}/workload")]
    public async Task<IActionResult> GetWorkload(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // Team + members
        var teamResult = (await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (teamResult is null) return NotFound();

        var members = teamResult.Members;

        // Active sprint
        var activeSprint = (await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("status", Operator.Equals, "active")
            .Order("start_date", Ordering.Descending)
            .Get()).Models.FirstOrDefault();

        // All non-resolved blockers for the team
        var allBlockers = (await sb.Db.From<Blocker>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("created_at", Ordering.Descending)
            .Get()).Models
            .Where(b => b.Status != BlockerStatus.Resolved)
            .ToList();

        // Open/in-progress action items in the active sprint
        var activeActionItems = new List<ActionItem>();
        if (activeSprint is not null)
        {
            activeActionItems = (await sb.Db.From<ActionItem>()
                .Filter("sprint_id", Operator.Equals, activeSprint.Id.ToString())
                .Order("created_at", Ordering.Descending)
                .Get()).Models
                .Where(a => a.Status == ActionItemStatus.Open || a.Status == ActionItemStatus.InProgress)
                .ToList();
        }

        // Per-member summaries
        var memberSummaries = members.Select(m => new
        {
            userId      = m.UserId,
            displayName = m.DisplayName,
            role        = m.Role.ToString().ToLower(),
            blockers    = allBlockers.Where(b => b.OwnerId == m.UserId).ToList(),
            actionItems = activeActionItems.Where(a => a.AssigneeId == m.UserId).ToList(),
        }).ToList();

        return Ok(new
        {
            team         = new { id = teamResult.Id, name = teamResult.Name },
            activeSprint,
            members      = memberSummaries,
        });
    }
}
