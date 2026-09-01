using Backend.Data;
using Backend.Models;
using Backend.Realtime;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class PokerController(AppDbContext db, ILiveNotifier live) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    private Task<Sprint?> GetSprint(Guid teamId, Guid sprintId) =>
        db.Sprints.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sprintId && s.TeamId == teamId);

    private async Task<PokerSession?> GetSession(Guid teamId, Guid sessionId)
    {
        var session = await db.PokerSessions.FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null) return null;

        var belongsToTeam = await db.Sprints.AsNoTracking()
            .AnyAsync(s => s.Id == session.SprintId && s.TeamId == teamId);

        return belongsToTeam ? session : null;
    }

    // ─── Deck helpers ─────────────────────────────────────────────────────────

    private static readonly List<string> FibDeck  = ["1", "2", "3", "5", "8", "13", "21", "?"];
    private static readonly List<string> TShirtDeck = ["XS", "S", "M", "L", "XL", "?"];

    private List<string> GetDeck(PokerSession session)
    {
        return session.DeckType switch
        {
            PokerDeckType.Fibonacci => FibDeck,
            PokerDeckType.TShirt    => TShirtDeck,
            PokerDeckType.Custom    => session.CustomDeckJson is not null
                ? JsonConvert.DeserializeObject<List<string>>(session.CustomDeckJson) ?? FibDeck
                : FibDeck,
            _ => FibDeck,
        };
    }

    // ─── List sessions for a team (for the list page) ────────────────────────

    // GET api/teams/{teamId}/poker-sessions
    [HttpGet("api/teams/{teamId:guid}/poker-sessions")]
    public async Task<IActionResult> ListSessions(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var sprintIds = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId)
            .Select(s => s.Id)
            .ToListAsync();

        if (sprintIds.Count == 0) return Ok(new { sessions = Array.Empty<object>() });

        var sessions = await db.PokerSessions.AsNoTracking()
            .Where(s => sprintIds.Contains(s.SprintId))
            .ToListAsync();

        return Ok(new { sessions });
    }

    // ─── Create session ───────────────────────────────────────────────────────

    // POST api/teams/{teamId}/sprints/{sprintId}/poker
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/poker")]
    public async Task<IActionResult> CreateSession(
        Guid teamId, Guid sprintId, [FromBody] CreatePokerRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var sprint = await GetSprint(teamId, sprintId);
        if (sprint is null) return NotFound("Sprint not found.");

        // Idempotent — return existing if already created
        var existing = await db.PokerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.SprintId == sprintId);
        if (existing is not null) return Ok(existing);

        var session = new PokerSession
        {
            SprintId      = sprintId,
            DeckType      = req.DeckType ?? PokerDeckType.Fibonacci,
            CustomDeckJson = req.CustomDeckJson,
            FacilitatorId = CurrentUserId,
            Status        = PokerSessionStatus.Pending,
        };

        db.PokerSessions.Add(session);
        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(sprintId));
        return Ok(session);
    }

    // ─── Get full session state ───────────────────────────────────────────────

    // GET api/teams/{teamId}/sprints/{sprintId}/poker
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/poker")]
    public async Task<IActionResult> GetPoker(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var sprint = await GetSprint(teamId, sprintId);
        if (sprint is null) return NotFound("Sprint not found.");

        var session = await db.PokerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.SprintId == sprintId);
        if (session is null) return NotFound("No poker session for this sprint.");

        // Load tickets + their votes, ordered
        var tickets = await db.PokerTickets.AsNoTracking()
            .Include(t => t.Votes)
            .Where(t => t.PokerSessionId == session.Id)
            .OrderBy(t => t.Order)
            .ToListAsync();

        // For each ticket, only expose own vote OR all votes if revealed
        foreach (var t in tickets)
        {
            t.Votes = t.Votes.Where(v => v.RevealedAt.HasValue || v.UserId == CurrentUserId).ToList();
        }

        // Load team members
        var members = await db.TeamMembers.AsNoTracking().Where(m => m.TeamId == teamId).ToListAsync();

        return Ok(new
        {
            session,
            tickets,
            teamMembers = members,
            sprintName  = sprint.Name,
            deck        = GetDeck(session),
        });
    }

    // ─── Add ticket ───────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/poker/{id}/tickets
    [HttpPost("api/teams/{teamId:guid}/poker/{id:guid}/tickets")]
    public async Task<IActionResult> AddTicket(
        Guid teamId, Guid id, [FromBody] AddTicketRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.Status == PokerSessionStatus.Completed)
            return BadRequest("Cannot add tickets to a completed session.");

        // Next order index
        var count = await db.PokerTickets.AsNoTracking().CountAsync(t => t.PokerSessionId == id);

        var ticket = new PokerTicket
        {
            PokerSessionId = id,
            Title          = req.Title.Trim(),
            Description    = req.Description?.Trim(),
            JiraIssueId    = req.JiraIssueId?.Trim(),
            Order          = count,
        };
        db.PokerTickets.Add(ticket);

        // Auto-set as current ticket if first one and session is pending
        if (count == 0 && session.Status == PokerSessionStatus.Pending)
        {
            session.CurrentTicketId = ticket.Id;
            session.Status          = PokerSessionStatus.InProgress;
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return Ok(ticket);
    }

    // ─── Delete ticket ────────────────────────────────────────────────────────

    // DELETE api/teams/{teamId}/poker/{id}/tickets/{ticketId}
    [HttpDelete("api/teams/{teamId:guid}/poker/{id:guid}/tickets/{ticketId:guid}")]
    public async Task<IActionResult> DeleteTicket(Guid teamId, Guid id, Guid ticketId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var ticket = await db.PokerTickets.FirstOrDefaultAsync(t => t.Id == ticketId && t.PokerSessionId == id);
        if (ticket is null) return NotFound();

        db.PokerTickets.Remove(ticket);
        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return NoContent();
    }

    // ─── Cast / update vote ───────────────────────────────────────────────────

    // POST api/teams/{teamId}/poker/{id}/vote
    [HttpPost("api/teams/{teamId:guid}/poker/{id:guid}/vote")]
    public async Task<IActionResult> CastVote(
        Guid teamId, Guid id, [FromBody] CastVoteRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.Status != PokerSessionStatus.InProgress)
            return BadRequest("Session is not in progress.");

        var ticket = await db.PokerTickets.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == req.TicketId && t.PokerSessionId == id);
        if (ticket is null) return NotFound("Ticket not found.");
        if (ticket.VotesRevealed) return BadRequest("Votes are already revealed for this ticket.");

        var existing = await db.PokerVotes
            .FirstOrDefaultAsync(v => v.PokerTicketId == req.TicketId && v.UserId == CurrentUserId);

        if (existing is null)
        {
            var vote = new PokerVote
            {
                PokerTicketId = req.TicketId,
                UserId        = CurrentUserId,
                Estimate      = req.Estimate,
            };
            db.PokerVotes.Add(vote);
            await db.SaveChangesAsync();
            live.Touch(Topics.Poker(session.SprintId));
            return Ok(vote);
        }

        existing.Estimate = req.Estimate;
        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return Ok(existing);
    }

    // ─── Reveal votes ─────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/poker/{id}/reveal
    [HttpPost("api/teams/{teamId:guid}/poker/{id:guid}/reveal")]
    public async Task<IActionResult> RevealVotes(
        Guid teamId, Guid id, [FromBody] RevealRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var ticket = await db.PokerTickets.FirstOrDefaultAsync(t => t.Id == req.TicketId && t.PokerSessionId == id);
        if (ticket is null) return NotFound("Ticket not found.");

        ticket.VotesRevealed = true;

        // Bulk update instead of a fetch-then-per-row-update loop — one statement
        // stamps revealed_at on every vote for this ticket.
        var now = DateTime.UtcNow;
        await db.PokerVotes
            .Where(v => v.PokerTicketId == req.TicketId)
            .ExecuteUpdateAsync(v => v.SetProperty(x => x.RevealedAt, now));

        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return Ok(ticket);
    }

    // ─── Set final points + advance ───────────────────────────────────────────

    // PATCH api/teams/{teamId}/poker/{id}/tickets/{ticketId}
    [HttpPatch("api/teams/{teamId:guid}/poker/{id:guid}/tickets/{ticketId:guid}")]
    public async Task<IActionResult> UpdateTicket(
        Guid teamId, Guid id, Guid ticketId, [FromBody] UpdateTicketRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var ticket = await db.PokerTickets.FirstOrDefaultAsync(t => t.Id == ticketId && t.PokerSessionId == id);
        if (ticket is null) return NotFound();

        if (req.FinalPoints.HasValue) ticket.FinalPoints = req.FinalPoints;
        if (req.Title is not null)    ticket.Title       = req.Title.Trim();

        // Advance to next unestimated ticket if requested
        if (req.AdvanceToNext == true)
        {
            var nextTicket = await db.PokerTickets.AsNoTracking()
                .Where(t => t.PokerSessionId == id && t.Id != ticketId && t.FinalPoints == null)
                .OrderBy(t => t.Order)
                .FirstOrDefaultAsync();

            session.CurrentTicketId = nextTicket?.Id;
            if (nextTicket is null) session.Status = PokerSessionStatus.Completed;
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return Ok(ticket);
    }

    // ─── Delete session ──────────────────────────────────────────────────────

    // DELETE api/teams/{teamId}/poker/{id}
    [HttpDelete("api/teams/{teamId:guid}/poker/{id:guid}")]
    public async Task<IActionResult> DeleteSession(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var sprintId = session.SprintId;
        db.PokerSessions.Remove(session);
        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(sprintId));
        return NoContent();
    }

    // ─── Set current ticket (facilitator jump) ────────────────────────────────

    // PATCH api/teams/{teamId}/poker/{id}/current
    [HttpPatch("api/teams/{teamId:guid}/poker/{id:guid}/current")]
    public async Task<IActionResult> SetCurrentTicket(
        Guid teamId, Guid id, [FromBody] SetCurrentRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSession(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        session.CurrentTicketId = req.TicketId;
        if (session.Status == PokerSessionStatus.Pending)
            session.Status = PokerSessionStatus.InProgress;

        await db.SaveChangesAsync();
        live.Touch(Topics.Poker(session.SprintId));
        return Ok(session);
    }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

public record CreatePokerRequest(PokerDeckType? DeckType, string? CustomDeckJson);
public record AddTicketRequest(string Title, string? Description, string? JiraIssueId);
public record CastVoteRequest(Guid TicketId, string Estimate);
public record RevealRequest(Guid TicketId);
public record UpdateTicketRequest(int? FinalPoints, string? Title, bool? AdvanceToNext);
public record SetCurrentRequest(Guid? TicketId);
