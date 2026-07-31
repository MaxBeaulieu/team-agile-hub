using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using static Postgrest.Constants;

namespace Backend.Controllers;

[ApiController]
[Route("api/teams/{teamId:guid}/sprints")]
public class SprintsController(SupabaseService sb, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    // GET api/teams/{teamId}/sprints
    [HttpGet]
    public async Task<IActionResult> GetSprints(Guid teamId)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var result = await sb.Db.From<Sprint>()
            .Select("*, sprint_members(*), sprint_trainings(*)")
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("start_date", Ordering.Descending)
            .Get();

        return Ok(result.Models);
    }

    // GET api/teams/{teamId}/sprints/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetSprint(Guid teamId, Guid id)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var result = await sb.Db.From<Sprint>()
            .Select("*, sprint_members(*), sprint_trainings(*), focus_topics(*), action_items(*), blockers(*)")
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("id",      Operator.Equals, id.ToString())
            .Get();

        var sprint = result.Models.FirstOrDefault();
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
        var prev = await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("start_date", Ordering.Descending)
            .Limit(1)
            .Get();

        var sprint = new Sprint
        {
            TeamId       = teamId,
            Name         = req.Name,
            Goal         = req.Goal,
            PreviousGoal = prev.Models.FirstOrDefault()?.Goal,
            ChampionId   = req.ChampionId,
            StartDate    = req.StartDate,
            EndDate      = req.EndDate,
        };

        var created = (await sb.Db.From<Sprint>().Insert(sprint)).Models.First();

        // Seed focus topics from recurring agenda items
        var recurring = await sb.Db.From<RecurringAgendaItem>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get();

        if (recurring.Models.Any())
        {
            var topics = recurring.Models.Select((item, i) => new FocusTopic
            {
                SprintId = created.Id,
                Title    = item.Title,
                Status   = FocusTopicStatus.OnTrack,
                Order    = i,
            }).ToList();

            await sb.Db.From<FocusTopic>().Insert(topics);
        }

        return CreatedAtAction(nameof(GetSprint), new { teamId, id = created.Id }, created);
    }

    // PATCH api/teams/{teamId}/sprints/{id}
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateSprint(Guid teamId, Guid id, [FromBody] JObject body)
    {
        if (!await IsTeamAdminAsync(teamId)) return Forbid();

        var result = await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("id",      Operator.Equals, id.ToString())
            .Get();

        var sprint = result.Models.FirstOrDefault();
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

        await sb.Db.From<Sprint>().Update(sprint);
        return Ok(sprint);
    }

    // DELETE api/teams/{teamId}/sprints/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteSprint(Guid teamId, Guid id)
    {
        if (!await IsTeamAdminAsync(teamId)) return Forbid();

        var sprint = (await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("id",      Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();

        if (sprint is null) return NotFound();

        // Everything hanging off the sprint (members, trainings, focus topics, retros,
        // poker sessions, action items) is removed by the ON DELETE CASCADE chain.
        await sb.Db.From<Sprint>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();

        return NoContent();
    }

    // PUT api/teams/{teamId}/sprints/{id}/members/{userId}
    [HttpPut("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> UpsertSprintMember(
        Guid teamId, Guid id, Guid userId, [FromBody] UpsertSprintMemberRequest req)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var existing = (await sb.Db.From<SprintMember>()
            .Filter("sprint_id", Operator.Equals, id.ToString())
            .Filter("user_id",   Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is null)
        {
            var m = new SprintMember { SprintId = id, UserId = userId, DaysOff = req.DaysOff, CapacityScore = req.CapacityScore };
            var inserted = (await sb.Db.From<SprintMember>().Insert(m)).Models.First();
            return Ok(inserted);
        }

        existing.DaysOff       = req.DaysOff;
        existing.CapacityScore = req.CapacityScore;
        await sb.Db.From<SprintMember>().Update(existing);
        return Ok(existing);
    }

    // PUT api/teams/{teamId}/sprints/{id}/training/{userId}
    [HttpPut("{id:guid}/training/{userId:guid}")]
    public async Task<IActionResult> UpsertTraining(
        Guid teamId, Guid id, Guid userId, [FromBody] UpsertTrainingRequest req)
    {
        if (!await IsTeamMemberAsync(teamId)) return Forbid();

        var existing = (await sb.Db.From<SprintTraining>()
            .Filter("sprint_id", Operator.Equals, id.ToString())
            .Filter("user_id",   Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is null)
        {
            var t = new SprintTraining { SprintId = id, UserId = userId, Description = req.Description };
            var inserted = (await sb.Db.From<SprintTraining>().Insert(t)).Models.First();
            return Ok(inserted);
        }

        existing.Description = req.Description;
        await sb.Db.From<SprintTraining>().Update(existing);
        return Ok(existing);
    }
}

public record CreateSprintRequest(string Name, string? Goal, Guid? ChampionId, DateTime StartDate, DateTime EndDate);
public record UpsertSprintMemberRequest(string? DaysOff, int? CapacityScore);
public record UpsertTrainingRequest(string Description);
