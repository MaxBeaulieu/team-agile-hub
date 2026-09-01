using Backend.Data;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;

namespace Backend.Controllers;

[ApiController]
[Route("api/teams/{teamId:guid}/sprints")]
public class SprintsController(AppDbContext db, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    // GET api/teams/{teamId}/sprints
    [HttpGet]
    public async Task<IActionResult> GetSprints(Guid teamId)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var sprints = await db.Sprints.AsNoTracking()
            .Include(s => s.SprintMembers)
            .Include(s => s.Trainings)
            .Where(s => s.TeamId == teamId)
            .OrderByDescending(s => s.StartDate)
            .ToListAsync();

        return Ok(sprints);
    }

    // GET api/teams/{teamId}/sprints/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetSprint(Guid teamId, Guid id)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var sprint = await db.Sprints.AsNoTracking()
            .Include(s => s.SprintMembers)
            .Include(s => s.Trainings)
            .Include(s => s.FocusTopics)
            .Include(s => s.ActionItems)
            .Include(s => s.Blockers)
            .FirstOrDefaultAsync(s => s.TeamId == teamId && s.Id == id);

        if (sprint is null) return NotFound();
        return Ok(sprint);
    }

    // POST api/teams/{teamId}/sprints
    [HttpPost]
    public async Task<IActionResult> CreateSprint(Guid teamId, [FromBody] CreateSprintRequest req)
    {
        // Shaping the cadence is an admin act; members participate in what it contains.
        if (!await IsTeamAdminAsync(teamId)) return Forbid();

        // Get the previous sprint goal for reference
        var prevGoal = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId)
            .OrderByDescending(s => s.StartDate)
            .Select(s => s.Goal)
            .FirstOrDefaultAsync();

        var sprint = new Sprint
        {
            TeamId       = teamId,
            Name         = req.Name,
            Goal         = req.Goal,
            PreviousGoal = prevGoal,
            ChampionId   = req.ChampionId,
            StartDate    = req.StartDate,
            EndDate      = req.EndDate,
        };
        db.Sprints.Add(sprint);

        // Seed focus topics from recurring agenda items
        var recurring = await db.RecurringAgendaItems.AsNoTracking()
            .Where(r => r.TeamId == teamId)
            .ToListAsync();

        if (recurring.Count > 0)
        {
            var topics = recurring.Select((item, i) => new FocusTopic
            {
                SprintId = sprint.Id,
                Title    = item.Title,
                Status   = FocusTopicStatus.OnTrack,
                Order    = i,
            }).ToList();

            db.FocusTopics.AddRange(topics);
        }

        // One SaveChangesAsync — the sprint and its seeded focus topics commit together
        // instead of as two separate round-trips.
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetSprint), new { teamId, id = sprint.Id }, sprint);
    }

    // PATCH api/teams/{teamId}/sprints/{id}
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateSprint(Guid teamId, Guid id, [FromBody] JObject body)
    {
        if (!await IsTeamAdminAsync(teamId)) return Forbid();

        var sprint = await db.Sprints.FirstOrDefaultAsync(s => s.TeamId == teamId && s.Id == id);
        if (sprint is null) return NotFound();

        if (body.TryGetValue("name", StringComparison.OrdinalIgnoreCase, out var nameToken)
            && nameToken.Type != JTokenType.Null)
            sprint.Name = nameToken.Value<string>() ?? sprint.Name;

        if (body.TryGetValue("goal", StringComparison.OrdinalIgnoreCase, out var goalToken))
            sprint.Goal = goalToken.Type == JTokenType.Null ? null : goalToken.Value<string>();

        if (body.TryGetValue("championId", StringComparison.OrdinalIgnoreCase, out var champToken))
            sprint.ChampionId = champToken.Type == JTokenType.Null ? null : champToken.Value<Guid?>();

        if (body.TryGetValue("status", StringComparison.OrdinalIgnoreCase, out var statusToken)
            && Enum.TryParse<SprintStatus>(statusToken.Value<string>(), ignoreCase: true, out var status))
            sprint.Status = status;

        await db.SaveChangesAsync();
        return Ok(sprint);
    }

    // DELETE api/teams/{teamId}/sprints/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteSprint(Guid teamId, Guid id)
    {
        if (!await IsTeamAdminAsync(teamId)) return Forbid();

        // Everything hanging off the sprint (members, trainings, focus topics, retros,
        // poker sessions, action items) is removed by the ON DELETE CASCADE chain —
        // ExecuteDeleteAsync issues a plain SQL DELETE, so it still fires.
        var deleted = await db.Sprints.Where(s => s.TeamId == teamId && s.Id == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound();

        return NoContent();
    }

    // PUT api/teams/{teamId}/sprints/{id}/members/{userId}
    [HttpPut("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> UpsertSprintMember(
        Guid teamId, Guid id, Guid userId, [FromBody] UpsertSprintMemberRequest req)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var existing = await db.SprintMembers.FirstOrDefaultAsync(m => m.SprintId == id && m.UserId == userId);

        if (existing is null)
        {
            var m = new SprintMember
            {
                SprintId = id, UserId = userId, DaysOff = req.DaysOff, CapacityScore = req.CapacityScore,
            };
            db.SprintMembers.Add(m);
            await db.SaveChangesAsync();
            return Ok(m);
        }

        existing.DaysOff       = req.DaysOff;
        existing.CapacityScore = req.CapacityScore;
        await db.SaveChangesAsync();
        return Ok(existing);
    }

    // PUT api/teams/{teamId}/sprints/{id}/training/{userId}
    [HttpPut("{id:guid}/training/{userId:guid}")]
    public async Task<IActionResult> UpsertTraining(
        Guid teamId, Guid id, Guid userId, [FromBody] UpsertTrainingRequest req)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var existing = await db.SprintTrainings.FirstOrDefaultAsync(t => t.SprintId == id && t.UserId == userId);

        if (existing is null)
        {
            var t = new SprintTraining { SprintId = id, UserId = userId, Description = req.Description };
            db.SprintTrainings.Add(t);
            await db.SaveChangesAsync();
            return Ok(t);
        }

        existing.Description = req.Description;
        await db.SaveChangesAsync();
        return Ok(existing);
    }
}

public record CreateSprintRequest(string Name, string? Goal, Guid? ChampionId, DateTime StartDate, DateTime EndDate);
public record UpsertSprintMemberRequest(string? DaysOff, int? CapacityScore);
public record UpsertTrainingRequest(string Description);
