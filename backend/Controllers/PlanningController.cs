using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class PlanningController(SupabaseService sb) : ControllerBase
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

    // ─── Planning Aggregate ──────────────────────────────────────────────────

    // GET api/teams/{teamId}/sprints/{sprintId}/planning
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/planning")]
    public async Task<IActionResult> GetPlanningData(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // Sprint with nested planning data
        var sprintResult = await sb.Db.From<Sprint>()
            .Select("*, sprint_members(*), sprint_trainings(*), focus_topics(*), action_items(*)")
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("id", Operator.Equals, sprintId.ToString())
            .Get();

        var sprint = sprintResult.Models.FirstOrDefault();
        if (sprint is null) return NotFound();

        // Load talking points + notes for each focus topic
        foreach (var topic in sprint.FocusTopics)
        {
            var tpResult = await sb.Db.From<TalkingPoint>()
                .Select("*, talking_point_notes(*), action_items(*)")
                .Filter("focus_topic_id", Operator.Equals, topic.Id.ToString())
                .Order("order", Ordering.Ascending)
                .Get();
            topic.TalkingPoints = tpResult.Models;
        }

        // Team with members
        var teamResult = await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, teamId.ToString())
            .Get();
        var teamMembers = teamResult.Models.FirstOrDefault()?.Members ?? new();

        // Recurring agenda with talking points
        var agendaResult = await sb.Db.From<RecurringAgendaItem>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get();

        foreach (var item in agendaResult.Models)
        {
            var tpResult = await sb.Db.From<TalkingPoint>()
                .Select("*, talking_point_notes(*), action_items(*)")
                .Filter("agenda_item_id", Operator.Equals, item.Id.ToString())
                .Order("order", Ordering.Ascending)
                .Get();
            item.TalkingPoints = tpResult.Models;
}

        // Previous sprint's open/in-progress action items for carry-over
        var prevSprintResult = await sb.Db.From<Sprint>()
            .Select("id")
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("start_date", Operator.LessThan, sprint.StartDate.ToString("o"))
            .Order("start_date", Ordering.Descending)
            .Limit(1)
            .Get();

        var carryOverItems = new List<ActionItem>();
        var prevSprint = prevSprintResult.Models.FirstOrDefault();
        if (prevSprint is not null)
        {
            var prevItems = await sb.Db.From<ActionItem>()
                .Filter("sprint_id", Operator.Equals, prevSprint.Id.ToString())
                .Filter("status", Operator.In, new List<string> { "open", "in_progress" })
                .Get();
            carryOverItems = prevItems.Models;
        }

        return Ok(new
        {
            Sprint = sprint,
            TeamMembers = teamMembers,
            RecurringAgenda = agendaResult.Models,
            CarryOverItems = carryOverItems,
        });
    }

    // ─── Focus Topics ────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/sprints/{sprintId}/focus-topics
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/focus-topics")]
    public async Task<IActionResult> CreateFocusTopic(Guid teamId, Guid sprintId, [FromBody] FocusTopicRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var existing = await sb.Db.From<FocusTopic>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get();
        var order = existing.Models.Any() ? existing.Models.Max(f => f.Order) + 1 : 0;

        var topic = new FocusTopic
        {
            SprintId = sprintId,
            Title    = req.Title,
            Content  = req.Content,
            Status   = req.Status ?? FocusTopicStatus.OnTrack,
            Order    = order,
        };

        var inserted = (await sb.Db.From<FocusTopic>().Insert(topic)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/focus-topics/{id}
    [HttpPatch("api/teams/{teamId:guid}/focus-topics/{id:guid}")]
    public async Task<IActionResult> UpdateFocusTopic(Guid teamId, Guid id, [FromBody] FocusTopicRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<FocusTopic>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        // Verify the topic's sprint belongs to this team
        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id", Operator.Equals, existing.SprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (sprint is null) return Forbid();

        if (req.Title  is not null)  existing.Title   = req.Title;
        if (req.Content is not null) existing.Content = req.Content;
        if (req.Status.HasValue)     existing.Status  = req.Status.Value;

        await sb.Db.From<FocusTopic>().Update(existing);
        return Ok(existing);
    }

    // DELETE api/teams/{teamId}/focus-topics/{id}
    [HttpDelete("api/teams/{teamId:guid}/focus-topics/{id:guid}")]
    public async Task<IActionResult> DeleteFocusTopic(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<FocusTopic>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id", Operator.Equals, existing.SprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (sprint is null) return Forbid();

        await sb.Db.From<FocusTopic>().Filter("id", Operator.Equals, id.ToString()).Delete();
        return NoContent();
    }

    // ─── Recurring Agenda ────────────────────────────────────────────────────

    // GET api/teams/{teamId}/recurring-agenda
    [HttpGet("api/teams/{teamId:guid}/recurring-agenda")]
    public async Task<IActionResult> GetRecurringAgenda(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var result = await sb.Db.From<RecurringAgendaItem>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get();
        return Ok(result.Models);
    }

    // POST api/teams/{teamId}/recurring-agenda
    [HttpPost("api/teams/{teamId:guid}/recurring-agenda")]
    public async Task<IActionResult> CreateRecurringAgendaItem(Guid teamId, [FromBody] RecurringAgendaRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var item = new RecurringAgendaItem { TeamId = teamId, Title = req.Title };
        var inserted = (await sb.Db.From<RecurringAgendaItem>().Insert(item)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/recurring-agenda/{id}
    [HttpPatch("api/teams/{teamId:guid}/recurring-agenda/{id:guid}")]
    public async Task<IActionResult> UpdateRecurringAgendaItem(Guid teamId, Guid id, [FromBody] RecurringAgendaRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<RecurringAgendaItem>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        if (req.Title      is not null) existing.Title      = req.Title;
        if (req.LastStatus is not null) existing.LastStatus = req.LastStatus;

        await sb.Db.From<RecurringAgendaItem>().Update(existing);
        return Ok(existing);
    }

    // DELETE api/teams/{teamId}/recurring-agenda/{id}
    [HttpDelete("api/teams/{teamId:guid}/recurring-agenda/{id:guid}")]
    public async Task<IActionResult> DeleteRecurringAgendaItem(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<RecurringAgendaItem>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        await sb.Db.From<RecurringAgendaItem>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();
        return NoContent();
    }

    // ─── Action Items ─────────────────────────────────────────────────────────

    // ─── Talking Points ──────────────────────────────────────────────────────

    // POST api/teams/{teamId}/focus-topics/{topicId}/talking-points
    [HttpPost("api/teams/{teamId:guid}/focus-topics/{topicId:guid}/talking-points")]
    public async Task<IActionResult> CreateTalkingPointForTopic(
        Guid teamId, Guid topicId, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var existing = (await sb.Db.From<TalkingPoint>()
            .Filter("focus_topic_id", Operator.Equals, topicId.ToString()).Get()).Models;
        var order = existing.Any() ? existing.Max(tp => tp.Order) + 1 : 0;

        var point = new TalkingPoint { FocusTopicId = topicId, Text = req.Text.Trim(), Order = order };
        var inserted = (await sb.Db.From<TalkingPoint>().Insert(point)).Models.First();
        return Ok(inserted);
    }

    // POST api/teams/{teamId}/agenda/{itemId}/talking-points
    [HttpPost("api/teams/{teamId:guid}/agenda/{itemId:guid}/talking-points")]
    public async Task<IActionResult> CreateTalkingPointForAgenda(
        Guid teamId, Guid itemId, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var existing = (await sb.Db.From<TalkingPoint>()
            .Filter("agenda_item_id", Operator.Equals, itemId.ToString()).Get()).Models;
        var order = existing.Any() ? existing.Max(tp => tp.Order) + 1 : 0;

        var point = new TalkingPoint { AgendaItemId = itemId, Text = req.Text.Trim(), Order = order };
        var inserted = (await sb.Db.From<TalkingPoint>().Insert(point)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/talking-points/{id}
    [HttpPatch("api/teams/{teamId:guid}/talking-points/{id:guid}")]
    public async Task<IActionResult> UpdateTalkingPoint(
        Guid teamId, Guid id, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var point = (await sb.Db.From<TalkingPoint>()
            .Filter("id", Operator.Equals, id.ToString()).Get()).Models.FirstOrDefault();
        if (point is null) return NotFound();

        if (req.Text is not null) point.Text = req.Text.Trim();
        await sb.Db.From<TalkingPoint>().Update(point);
        return Ok(point);
    }

    // DELETE api/teams/{teamId}/talking-points/{id}
    [HttpDelete("api/teams/{teamId:guid}/talking-points/{id:guid}")]
    public async Task<IActionResult> DeleteTalkingPoint(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        await sb.Db.From<TalkingPoint>().Filter("id", Operator.Equals, id.ToString()).Delete();
        return NoContent();
    }

    // ─── Talking Point Notes ─────────────────────────────────────────────────

    // POST api/teams/{teamId}/talking-points/{pointId}/notes
    [HttpPost("api/teams/{teamId:guid}/talking-points/{pointId:guid}/notes")]
    public async Task<IActionResult> AddNote(
        Guid teamId, Guid pointId, [FromBody] AddNoteRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Content)) return BadRequest("Content is required.");

        var note = new TalkingPointNote
        {
            TalkingPointId = pointId,
            AuthorId       = CurrentUserId,
            Content        = req.Content.Trim(),
        };

        var inserted = (await sb.Db.From<TalkingPointNote>().Insert(note)).Models.First();
        return Ok(inserted);
    }

    // DELETE api/teams/{teamId}/notes/{id}
    [HttpDelete("api/teams/{teamId:guid}/notes/{id:guid}")]
    public async Task<IActionResult> DeleteNote(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var note = (await sb.Db.From<TalkingPointNote>()
            .Filter("id", Operator.Equals, id.ToString()).Get()).Models.FirstOrDefault();
        if (note is null) return NotFound();
        // Only author can delete their own note
        if (note.AuthorId != CurrentUserId) return Forbid();

        await sb.Db.From<TalkingPointNote>().Filter("id", Operator.Equals, id.ToString()).Delete();
        return NoContent();
    }

    // GET api/teams/{teamId}/action-items?sprintId=&status=&type=&assigneeId=
    [HttpGet("api/teams/{teamId:guid}/action-items")]
    public async Task<IActionResult> GetActionItems(
        Guid teamId,
        [FromQuery] Guid? sprintId,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] Guid? assigneeId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var allSprints = (await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("start_date", Ordering.Descending)
            .Get()).Models;

        if (!allSprints.Any())
            return Ok(new { items = Array.Empty<ActionItem>(), sprints = allSprints });

        List<ActionItem> items;
        if (sprintId.HasValue)
        {
            var q = sb.Db.From<ActionItem>()
                .Filter("sprint_id", Operator.Equals, sprintId.Value.ToString())
                .Order("created_at", Ordering.Descending);
            if (!string.IsNullOrWhiteSpace(status))
                q = q.Filter("status", Operator.Equals, status);
            if (!string.IsNullOrWhiteSpace(type))
                q = q.Filter("type", Operator.Equals, type);
            if (assigneeId.HasValue)
                q = q.Filter("assignee_id", Operator.Equals, assigneeId.Value.ToString());
            items = (await q.Get()).Models;
        }
        else
        {
            var sprintIds = allSprints.Select(s => s.Id.ToString()).ToList();
            var q = sb.Db.From<ActionItem>()
                .Filter("sprint_id", Operator.In, sprintIds)
                .Order("created_at", Ordering.Descending);
            if (!string.IsNullOrWhiteSpace(status))
                q = q.Filter("status", Operator.Equals, status);
            if (!string.IsNullOrWhiteSpace(type))
                q = q.Filter("type", Operator.Equals, type);
            if (assigneeId.HasValue)
                q = q.Filter("assignee_id", Operator.Equals, assigneeId.Value.ToString());
            items = (await q.Get()).Models;
        }

        return Ok(new { items, sprints = allSprints });
    }

    // POST api/teams/{teamId}/sprints/{sprintId}/action-items
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/action-items")]
    public async Task<IActionResult> CreateActionItem(Guid teamId, Guid sprintId, [FromBody] CreateActionItemRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var item = new ActionItem
        {
            SprintId        = sprintId,
            Type            = ActionItemType.Planning,
            Text            = req.Text,
            AssigneeId      = req.AssigneeId,
            TalkingPointId  = req.TalkingPointId,
        };

        var inserted = (await sb.Db.From<ActionItem>().Insert(item)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/action-items/{id}
    [HttpPatch("api/teams/{teamId:guid}/action-items/{id:guid}")]
    public async Task<IActionResult> UpdateActionItem(Guid teamId, Guid id, [FromBody] UpdateActionItemRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<ActionItem>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        if (req.Text   is not null)  existing.Text       = req.Text;
        if (req.Status.HasValue)     existing.Status     = req.Status.Value;
        if (req.AssigneeId.HasValue) existing.AssigneeId = req.AssigneeId;

        await sb.Db.From<ActionItem>().Update(existing);
        return Ok(existing);
    }

    // POST api/teams/{teamId}/sprints/{sprintId}/carry-over/{sourceId}
    // Carries an action item from the previous sprint into this sprint
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/carry-over/{sourceId:guid}")]
    public async Task<IActionResult> CarryOverActionItem(Guid teamId, Guid sprintId, Guid sourceId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var source = (await sb.Db.From<ActionItem>()
            .Filter("id", Operator.Equals, sourceId.ToString())
            .Get()).Models.FirstOrDefault();
        if (source is null) return NotFound();

        // Mark source as carried over
        source.Status = ActionItemStatus.CarriedOver;
        await sb.Db.From<ActionItem>().Update(source);

        // Create new item in target sprint
        var carried = new ActionItem
        {
            SprintId      = sprintId,
            Type          = source.Type,
            Text          = source.Text,
            AssigneeId    = source.AssigneeId,
            DueDate       = source.DueDate,
            CarriedFromId = source.Id,
        };

        var inserted = (await sb.Db.From<ActionItem>().Insert(carried)).Models.First();
        return Ok(inserted);
    }

    // POST api/teams/{teamId}/action-items/{id}/drop
    [HttpPost("api/teams/{teamId:guid}/action-items/{id:guid}/drop")]
    public async Task<IActionResult> DropActionItem(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = (await sb.Db.From<ActionItem>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is null) return NotFound();

        existing.Status = ActionItemStatus.Dropped;
        await sb.Db.From<ActionItem>().Update(existing);
        return Ok(existing);
    }
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────
public record FocusTopicRequest(string? Title, string? Content, FocusTopicStatus? Status);
public record RecurringAgendaRequest(string? Title, string? LastStatus);
public record CreateActionItemRequest(string Text, Guid? AssigneeId, Guid? TalkingPointId);
public record UpdateActionItemRequest(ActionItemStatus? Status, string? Text, Guid? AssigneeId);
public record TalkingPointRequest(string? Text);
public record AddNoteRequest(string Content);
