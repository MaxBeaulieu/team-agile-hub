using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class PokerController(SupabaseService sb) : ControllerBase
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

    private async Task<Sprint?> GetSprint(Guid teamId, Guid sprintId)
    {
        var r = await sb.Db.From<Sprint>()
            .Filter("id",      Operator.Equals, sprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get();
        return r.Models.FirstOrDefault();
    }

    private async Task<PokerSession?> GetSession(Guid teamId, Guid sessionId)
    {
        var sprint = (await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.Select(s => s.Id.ToString()).ToList();

        if (!sprint.Any()) return null;

        var r = await sb.Db.From<PokerSession>()
            .Filter("id", Operator.Equals, sessionId.ToString())
            .Get();

        var session = r.Models.FirstOrDefault();
        if (session is null || !sprint.Contains(session.SprintId.ToString())) return null;
        return session;
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

        var sprintIds = (await sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.Select(s => s.Id.ToString()).ToList();

        if (!sprintIds.Any()) return Ok(new { sessions = Array.Empty<object>() });

        var sessions = (await sb.Db.From<PokerSession>()
            .Filter("sprint_id", Operator.In, sprintIds)
            .Get()).Models;

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
        var existing = (await sb.Db.From<PokerSession>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is not null) return Ok(existing);

        var session = new PokerSession
        {
            SprintId      = sprintId,
            DeckType      = req.DeckType ?? PokerDeckType.Fibonacci,
            CustomDeckJson = req.CustomDeckJson,
            FacilitatorId = CurrentUserId,
            Status        = PokerSessionStatus.Pending,
        };

        var inserted = (await sb.Db.From<PokerSession>().Insert(session)).Models.First();
        return Ok(inserted);
    }

    // ─── Get full session state ───────────────────────────────────────────────

    // GET api/teams/{teamId}/sprints/{sprintId}/poker
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/poker")]
    public async Task<IActionResult> GetPoker(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var sprint = await GetSprint(teamId, sprintId);
        if (sprint is null) return NotFound("Sprint not found.");

        var session = (await sb.Db.From<PokerSession>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get()).Models.FirstOrDefault();
        if (session is null) return NotFound("No poker session for this sprint.");

        // Load tickets ordered
        var tickets = (await sb.Db.From<PokerTicket>()
            .Filter("poker_session_id", Operator.Equals, session.Id.ToString())
            .Order("order", Ordering.Ascending)
            .Get()).Models;

        // Load votes for all tickets
        var ticketIds = tickets.Select(t => t.Id.ToString()).ToList();
        List<PokerVote> votes = [];
        if (ticketIds.Any())
        {
            votes = (await sb.Db.From<PokerVote>()
                .Filter("poker_ticket_id", Operator.In, ticketIds)
                .Get()).Models;
        }

        // For each ticket, only expose own vote OR all votes if revealed
        var visibleVotes = votes
            .Where(v => v.RevealedAt.HasValue || v.UserId == CurrentUserId)
            .ToList();

        // Attach votes to tickets
        var votesById = visibleVotes.GroupBy(v => v.PokerTicketId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var t in tickets)
            t.Votes = votesById.TryGetValue(t.Id, out var tv) ? tv : [];

        // Load team members
        var members = (await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models;

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
        var count = (await sb.Db.From<PokerTicket>()
            .Filter("poker_session_id", Operator.Equals, id.ToString())
            .Get()).Models.Count;

        var ticket = new PokerTicket
        {
            PokerSessionId = id,
            Title          = req.Title.Trim(),
            Description    = req.Description?.Trim(),
            JiraIssueId    = req.JiraIssueId?.Trim(),
            Order          = count,
        };

        var inserted = (await sb.Db.From<PokerTicket>().Insert(ticket)).Models.First();

        // Auto-set as current ticket if first one and session is pending
        if (count == 0 && session.Status == PokerSessionStatus.Pending)
        {
            session.CurrentTicketId = inserted.Id;
            session.Status          = PokerSessionStatus.InProgress;
            await sb.Db.From<PokerSession>().Update(session);
        }

        return Ok(inserted);
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

        var ticket = (await sb.Db.From<PokerTicket>()
            .Filter("id",               Operator.Equals, ticketId.ToString())
            .Filter("poker_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (ticket is null) return NotFound();

        await sb.Db.From<PokerTicket>().Delete(ticket);
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

        var ticket = (await sb.Db.From<PokerTicket>()
            .Filter("id",               Operator.Equals, req.TicketId.ToString())
            .Filter("poker_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (ticket is null) return NotFound("Ticket not found.");
        if (ticket.VotesRevealed) return BadRequest("Votes are already revealed for this ticket.");

        var existing = (await sb.Db.From<PokerVote>()
            .Filter("poker_ticket_id", Operator.Equals, req.TicketId.ToString())
            .Filter("user_id",         Operator.Equals, CurrentUserId.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is null)
        {
            var vote = new PokerVote
            {
                PokerTicketId = req.TicketId,
                UserId        = CurrentUserId,
                Estimate      = req.Estimate,
            };
            var inserted = (await sb.Db.From<PokerVote>().Insert(vote)).Models.First();
            return Ok(inserted);
        }

        existing.Estimate = req.Estimate;
        await sb.Db.From<PokerVote>().Update(existing);
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

        var ticket = (await sb.Db.From<PokerTicket>()
            .Filter("id",               Operator.Equals, req.TicketId.ToString())
            .Filter("poker_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (ticket is null) return NotFound("Ticket not found.");

        ticket.VotesRevealed = true;
        await sb.Db.From<PokerTicket>().Update(ticket);

        // Stamp revealed_at on all votes for this ticket
        var votes = (await sb.Db.From<PokerVote>()
            .Filter("poker_ticket_id", Operator.Equals, req.TicketId.ToString())
            .Get()).Models;

        var now = DateTime.UtcNow;
        foreach (var v in votes)
        {
            v.RevealedAt = now;
            await sb.Db.From<PokerVote>().Update(v);
        }

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

        var ticket = (await sb.Db.From<PokerTicket>()
            .Filter("id",               Operator.Equals, ticketId.ToString())
            .Filter("poker_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (ticket is null) return NotFound();

        if (req.FinalPoints.HasValue) ticket.FinalPoints = req.FinalPoints;
        if (req.Title is not null)    ticket.Title       = req.Title.Trim();
        await sb.Db.From<PokerTicket>().Update(ticket);

        // Advance to next unestimated ticket if requested
        if (req.AdvanceToNext == true)
        {
            var allTickets = (await sb.Db.From<PokerTicket>()
                .Filter("poker_session_id", Operator.Equals, id.ToString())
                .Order("order", Ordering.Ascending)
                .Get()).Models;

            var nextTicket = allTickets
                .Where(t => t.Id != ticketId && t.FinalPoints is null)
                .OrderBy(t => t.Order)
                .FirstOrDefault();

            session.CurrentTicketId = nextTicket?.Id;
            if (nextTicket is null) session.Status = PokerSessionStatus.Completed;
            await sb.Db.From<PokerSession>().Update(session);
        }

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

        await sb.Db.From<PokerSession>().Delete(session);
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

        await sb.Db.From<PokerSession>().Update(session);
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
