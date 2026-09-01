using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class WorkloadController(AppDbContext db) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    // GET api/teams/{teamId}/workload
    [HttpGet("api/teams/{teamId:guid}/workload")]
    public async Task<IActionResult> GetWorkload(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // Team + members
        var teamResult = await db.Teams.AsNoTracking()
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == teamId);

        if (teamResult is null) return NotFound();

        var members = teamResult.Members;

        // Active sprint
        var activeSprint = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId && s.Status == SprintStatus.Active)
            .OrderByDescending(s => s.StartDate)
            .FirstOrDefaultAsync();

        // All non-resolved blockers for the team
        var allBlockers = await db.Blockers.AsNoTracking()
            .Where(b => b.TeamId == teamId && b.Status != BlockerStatus.Resolved)
            .OrderByDescending(b => b.CreatedAt)
            .ToListAsync();

        // Open/in-progress action items in the active sprint
        var activeActionItems = new List<ActionItem>();
        if (activeSprint is not null)
        {
            activeActionItems = await db.ActionItems.AsNoTracking()
                .Where(a => a.SprintId == activeSprint.Id
                    && (a.Status == ActionItemStatus.Open || a.Status == ActionItemStatus.InProgress))
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync();
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
