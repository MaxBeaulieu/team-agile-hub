using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class PlanningController(AppDbContext db) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    // ─── Planning Aggregate ──────────────────────────────────────────────────

    // GET api/teams/{teamId}/sprints/{sprintId}/planning
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/planning")]
    public async Task<IActionResult> GetPlanningData(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // Sprint with nested planning data
        var sprint = await db.Sprints.AsNoTracking()
            .Include(s => s.SprintMembers)
            .Include(s => s.Trainings)
            .Include(s => s.FocusTopics)
            .Include(s => s.ActionItems)
            .FirstOrDefaultAsync(s => s.TeamId == teamId && s.Id == sprintId);

        if (sprint is null) return NotFound();

        // Load talking points + notes for each focus topic
        foreach (var topic in sprint.FocusTopics)
        {
            topic.TalkingPoints = await db.TalkingPoints.AsNoTracking()
                .Include(tp => tp.Notes)
                .Include(tp => tp.ActionItems)
                .Where(tp => tp.FocusTopicId == topic.Id)
                .OrderBy(tp => tp.Order)
                .ToListAsync();
        }

        // Team with members
        var team = await db.Teams.AsNoTracking().Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == teamId);
        var teamMembers = team?.Members ?? new();

        // Recurring agenda with talking points
        var recurringAgenda = await db.RecurringAgendaItems.AsNoTracking()
            .Where(r => r.TeamId == teamId)
            .ToListAsync();

        foreach (var item in recurringAgenda)
        {
            item.TalkingPoints = await db.TalkingPoints.AsNoTracking()
                .Include(tp => tp.Notes)
                .Include(tp => tp.ActionItems)
                .Where(tp => tp.AgendaItemId == item.Id)
                .OrderBy(tp => tp.Order)
                .ToListAsync();
        }

        // Previous sprint's open/in-progress action items for carry-over
        var prevSprint = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId && s.StartDate < sprint.StartDate)
            .OrderByDescending(s => s.StartDate)
            .FirstOrDefaultAsync();

        var carryOverItems = new List<ActionItem>();
        if (prevSprint is not null)
        {
            carryOverItems = await db.ActionItems.AsNoTracking()
                .Where(a => a.SprintId == prevSprint.Id
                    && (a.Status == ActionItemStatus.Open || a.Status == ActionItemStatus.InProgress))
                .ToListAsync();
        }

        return Ok(new
        {
            Sprint = sprint,
            TeamMembers = teamMembers,
            RecurringAgenda = recurringAgenda,
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

        var maxOrder = await db.FocusTopics.AsNoTracking()
            .Where(f => f.SprintId == sprintId)
            .Select(f => (int?)f.Order)
            .MaxAsync();

        var topic = new FocusTopic
        {
            SprintId = sprintId,
            Title    = req.Title,
            Content  = req.Content,
            Status   = req.Status ?? FocusTopicStatus.OnTrack,
            Order    = (maxOrder ?? -1) + 1,
        };

        db.FocusTopics.Add(topic);
        await db.SaveChangesAsync();
        return Ok(topic);
    }

    // PATCH api/teams/{teamId}/focus-topics/{id}
    [HttpPatch("api/teams/{teamId:guid}/focus-topics/{id:guid}")]
    public async Task<IActionResult> UpdateFocusTopic(Guid teamId, Guid id, [FromBody] FocusTopicRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.FocusTopics.FirstOrDefaultAsync(f => f.Id == id);
        if (existing is null) return NotFound();

        // Verify the topic's sprint belongs to this team
        var belongsToTeam = await db.Sprints.AsNoTracking()
            .AnyAsync(s => s.Id == existing.SprintId && s.TeamId == teamId);
        if (!belongsToTeam) return Forbid();

        if (req.Title  is not null)  existing.Title   = req.Title;
        if (req.Content is not null) existing.Content = req.Content;
        if (req.Status.HasValue)     existing.Status  = req.Status.Value;

        await db.SaveChangesAsync();
        return Ok(existing);
    }

    // DELETE api/teams/{teamId}/focus-topics/{id}
    [HttpDelete("api/teams/{teamId:guid}/focus-topics/{id:guid}")]
    public async Task<IActionResult> DeleteFocusTopic(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.FocusTopics.FirstOrDefaultAsync(f => f.Id == id);
        if (existing is null) return NotFound();

        var belongsToTeam = await db.Sprints.AsNoTracking()
            .AnyAsync(s => s.Id == existing.SprintId && s.TeamId == teamId);
        if (!belongsToTeam) return Forbid();

        db.FocusTopics.Remove(existing);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Recurring Agenda ────────────────────────────────────────────────────

    // GET api/teams/{teamId}/recurring-agenda
    [HttpGet("api/teams/{teamId:guid}/recurring-agenda")]
    public async Task<IActionResult> GetRecurringAgenda(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var items = await db.RecurringAgendaItems.AsNoTracking().Where(r => r.TeamId == teamId).ToListAsync();
        return Ok(items);
    }

    // POST api/teams/{teamId}/recurring-agenda
    [HttpPost("api/teams/{teamId:guid}/recurring-agenda")]
    public async Task<IActionResult> CreateRecurringAgendaItem(Guid teamId, [FromBody] RecurringAgendaRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var item = new RecurringAgendaItem { TeamId = teamId, Title = req.Title };
        db.RecurringAgendaItems.Add(item);
        await db.SaveChangesAsync();
        return Ok(item);
    }

    // PATCH api/teams/{teamId}/recurring-agenda/{id}
    [HttpPatch("api/teams/{teamId:guid}/recurring-agenda/{id:guid}")]
    public async Task<IActionResult> UpdateRecurringAgendaItem(Guid teamId, Guid id, [FromBody] RecurringAgendaRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.RecurringAgendaItems.FirstOrDefaultAsync(r => r.Id == id && r.TeamId == teamId);
        if (existing is null) return NotFound();

        if (req.Title      is not null) existing.Title      = req.Title;
        if (req.LastStatus is not null) existing.LastStatus = req.LastStatus;

        await db.SaveChangesAsync();
        return Ok(existing);
    }

    // DELETE api/teams/{teamId}/recurring-agenda/{id}
    [HttpDelete("api/teams/{teamId:guid}/recurring-agenda/{id:guid}")]
    public async Task<IActionResult> DeleteRecurringAgendaItem(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.RecurringAgendaItems.FirstOrDefaultAsync(r => r.Id == id && r.TeamId == teamId);
        if (existing is null) return NotFound();

        db.RecurringAgendaItems.Remove(existing);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Talking Points ──────────────────────────────────────────────────────

    // POST api/teams/{teamId}/focus-topics/{topicId}/talking-points
    [HttpPost("api/teams/{teamId:guid}/focus-topics/{topicId:guid}/talking-points")]
    public async Task<IActionResult> CreateTalkingPointForTopic(
        Guid teamId, Guid topicId, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var maxOrder = await db.TalkingPoints.AsNoTracking()
            .Where(tp => tp.FocusTopicId == topicId)
            .Select(tp => (int?)tp.Order)
            .MaxAsync();

        var point = new TalkingPoint { FocusTopicId = topicId, Text = req.Text.Trim(), Order = (maxOrder ?? -1) + 1 };
        db.TalkingPoints.Add(point);
        await db.SaveChangesAsync();
        return Ok(point);
    }

    // POST api/teams/{teamId}/agenda/{itemId}/talking-points
    [HttpPost("api/teams/{teamId:guid}/agenda/{itemId:guid}/talking-points")]
    public async Task<IActionResult> CreateTalkingPointForAgenda(
        Guid teamId, Guid itemId, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var maxOrder = await db.TalkingPoints.AsNoTracking()
            .Where(tp => tp.AgendaItemId == itemId)
            .Select(tp => (int?)tp.Order)
            .MaxAsync();

        var point = new TalkingPoint { AgendaItemId = itemId, Text = req.Text.Trim(), Order = (maxOrder ?? -1) + 1 };
        db.TalkingPoints.Add(point);
        await db.SaveChangesAsync();
        return Ok(point);
    }

    // PATCH api/teams/{teamId}/talking-points/{id}
    [HttpPatch("api/teams/{teamId:guid}/talking-points/{id:guid}")]
    public async Task<IActionResult> UpdateTalkingPoint(
        Guid teamId, Guid id, [FromBody] TalkingPointRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var point = await db.TalkingPoints.FirstOrDefaultAsync(tp => tp.Id == id);
        if (point is null) return NotFound();

        if (req.Text is not null) point.Text = req.Text.Trim();
        await db.SaveChangesAsync();
        return Ok(point);
    }

    // DELETE api/teams/{teamId}/talking-points/{id}
    [HttpDelete("api/teams/{teamId:guid}/talking-points/{id:guid}")]
    public async Task<IActionResult> DeleteTalkingPoint(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        await db.TalkingPoints.Where(tp => tp.Id == id).ExecuteDeleteAsync();
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

        db.TalkingPointNotes.Add(note);
        await db.SaveChangesAsync();
        return Ok(note);
    }

    // DELETE api/teams/{teamId}/notes/{id}
    [HttpDelete("api/teams/{teamId:guid}/notes/{id:guid}")]
    public async Task<IActionResult> DeleteNote(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var note = await db.TalkingPointNotes.FirstOrDefaultAsync(n => n.Id == id);
        if (note is null) return NotFound();
        // Only author can delete their own note
        if (note.AuthorId != CurrentUserId) return Forbid();

        db.TalkingPointNotes.Remove(note);
        await db.SaveChangesAsync();
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

        var allSprints = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId)
            .OrderByDescending(s => s.StartDate)
            .ToListAsync();

        if (allSprints.Count == 0)
            return Ok(new { items = Array.Empty<ActionItem>(), sprints = allSprints });

        IQueryable<ActionItem> q;
        if (sprintId.HasValue)
        {
            q = db.ActionItems.AsNoTracking().Where(a => a.SprintId == sprintId.Value);
        }
        else
        {
            var teamSprintIds = allSprints.Select(s => (Guid?)s.Id).ToList();
            q = db.ActionItems.AsNoTracking().Where(a => teamSprintIds.Contains(a.SprintId));
        }

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ActionItemStatus>(status, true, out var statusFilter))
            q = q.Where(a => a.Status == statusFilter);
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<ActionItemType>(type, true, out var typeFilter))
            q = q.Where(a => a.Type == typeFilter);
        if (assigneeId.HasValue)
            q = q.Where(a => a.AssigneeId == assigneeId.Value);

        var items = await q.OrderByDescending(a => a.CreatedAt).ToListAsync();

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

        db.ActionItems.Add(item);
        await db.SaveChangesAsync();
        return Ok(item);
    }

    // PATCH api/teams/{teamId}/action-items/{id}
    [HttpPatch("api/teams/{teamId:guid}/action-items/{id:guid}")]
    public async Task<IActionResult> UpdateActionItem(Guid teamId, Guid id, [FromBody] UpdateActionItemRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.ActionItems.FirstOrDefaultAsync(a => a.Id == id);
        if (existing is null) return NotFound();

        if (req.Text   is not null)  existing.Text       = req.Text;
        if (req.Status.HasValue)     existing.Status     = req.Status.Value;
        if (req.AssigneeId.HasValue) existing.AssigneeId = req.AssigneeId;

        await db.SaveChangesAsync();
        return Ok(existing);
    }

    // POST api/teams/{teamId}/sprints/{sprintId}/carry-over/{sourceId}
    // Carries an action item from the previous sprint into this sprint
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/carry-over/{sourceId:guid}")]
    public async Task<IActionResult> CarryOverActionItem(Guid teamId, Guid sprintId, Guid sourceId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var source = await db.ActionItems.FirstOrDefaultAsync(a => a.Id == sourceId);
        if (source is null) return NotFound();

        // Mark source as carried over
        source.Status = ActionItemStatus.CarriedOver;

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
        db.ActionItems.Add(carried);

        // One SaveChangesAsync — the source's status change and the new carried
        // item commit together instead of as two separate round-trips.
        await db.SaveChangesAsync();
        return Ok(carried);
    }

    // POST api/teams/{teamId}/action-items/{id}/drop
    [HttpPost("api/teams/{teamId:guid}/action-items/{id:guid}/drop")]
    public async Task<IActionResult> DropActionItem(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var existing = await db.ActionItems.FirstOrDefaultAsync(a => a.Id == id);
        if (existing is null) return NotFound();

        existing.Status = ActionItemStatus.Dropped;
        await db.SaveChangesAsync();
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
