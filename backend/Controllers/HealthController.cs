using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class HealthController(AppDbContext db) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    // GET /api/teams/{teamId}/sprints/{sprintId}/health
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/health")]
    public async Task<IActionResult> GetHealth(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // The original Task.WhenAll batching doesn't carry over: a single
        // AppDbContext instance isn't thread-safe and can't run concurrent
        // queries the way separate Postgrest HTTP requests could. Sequential
        // instead — each query here is small on its own.
        var sprint = await db.Sprints.AsNoTracking()
            .Include(s => s.SprintMembers)
            .FirstOrDefaultAsync(s => s.Id == sprintId && s.TeamId == teamId);
        if (sprint is null) return NotFound();

        var team = await db.Teams.AsNoTracking().Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == teamId);
        var teamMembers = team?.Members ?? [];

        var actions = await db.ActionItems.AsNoTracking().Where(a => a.SprintId == sprintId).ToListAsync();
        var blockers = await db.Blockers.AsNoTracking().Where(b => b.SprintId == sprintId).ToListAsync();
        var retros = await db.RetroSessions.AsNoTracking().Where(r => r.SprintId == sprintId).ToListAsync();
        var allSprints = await db.Sprints.AsNoTracking()
            .Where(s => s.TeamId == teamId)
            .OrderByDescending(s => s.StartDate)
            .Take(8)
            .ToListAsync();

        // ── Mood checkins (separate query keyed to retro session IDs) ─────────
        List<MoodCheckin> allCheckins = [];
        if (retros.Count > 0)
        {
            var retroIds = retros.Select(r => r.Id).ToList();
            allCheckins = await db.MoodCheckins.AsNoTracking()
                .Where(m => retroIds.Contains(m.RetroSessionId))
                .ToListAsync();
        }

        // ── Poker sessions for all recent team sprints ─────────────────────────
        var allSprintIds = allSprints.Select(s => s.Id).ToList();
        List<PokerSession> allPokerSessions = [];
        if (allSprintIds.Count > 0)
        {
            allPokerSessions = await db.PokerSessions.AsNoTracking()
                .Where(p => allSprintIds.Contains(p.SprintId))
                .ToListAsync();
        }

        // ── Tickets for all those sessions ──────────────────────────────────────
        var allSessionIds = allPokerSessions.Select(s => s.Id).ToList();
        List<PokerTicket> allTickets = [];
        if (allSessionIds.Count > 0)
        {
            allTickets = await db.PokerTickets.AsNoTracking()
                .Where(t => allSessionIds.Contains(t.PokerSessionId))
                .ToListAsync();
        }

        // ── Votes for this sprint's tickets ─────────────────────────────────────
        var currentSession = allPokerSessions.FirstOrDefault(s => s.SprintId == sprintId);
        var currentTickets = currentSession is not null
            ? allTickets.Where(t => t.PokerSessionId == currentSession.Id).ToList()
            : [];
        List<PokerVote> votes = [];
        if (currentTickets.Count > 0)
        {
            var ticketIds = currentTickets.Select(t => t.Id).ToList();
            votes = await db.PokerVotes.AsNoTracking()
                .Where(v => ticketIds.Contains(v.PokerTicketId))
                .ToListAsync();
        }

        // ── Compute: capacity ─────────────────────────────────────────────────
        var capacity = sprint.SprintMembers.Select(sm =>
        {
            var member       = teamMembers.FirstOrDefault(m => m.UserId == sm.UserId);
            var daysOffCount = string.IsNullOrEmpty(sm.DaysOff)
                ? 0
                : sm.DaysOff.Split(',', StringSplitOptions.RemoveEmptyEntries).Length;
            return new
            {
                userId        = sm.UserId,
                displayName   = member?.DisplayName ?? sm.UserId.ToString()[..8],
                daysOff       = daysOffCount,
                capacityScore = sm.CapacityScore,
            };
        }).ToList();

        // ── Compute: mood ─────────────────────────────────────────────────────
        var entryList = allCheckins.Where(c => c.EntryMood.HasValue).Select(c => (double)c.EntryMood!.Value).ToList();
        var exitList  = allCheckins.Where(c => c.ExitMood.HasValue).Select(c => (double)c.ExitMood!.Value).ToList();
        var mood = new
        {
            avgEntry = entryList.Count > 0 ? (double?)Math.Round(entryList.Average(), 1) : null,
            avgExit  = exitList.Count  > 0 ? (double?)Math.Round(exitList.Average(),  1) : null,
            totalCheckins = allCheckins.Count,
        };

        // ── Compute: action items ─────────────────────────────────────────────
        var actionItems = new
        {
            total       = actions.Count,
            open        = actions.Count(a => a.Status == ActionItemStatus.Open),
            inProgress  = actions.Count(a => a.Status == ActionItemStatus.InProgress),
            done        = actions.Count(a => a.Status == ActionItemStatus.Done),
            carriedOver = actions.Count(a => a.Status == ActionItemStatus.CarriedOver),
            dropped     = actions.Count(a => a.Status == ActionItemStatus.Dropped),
        };

        // ── Compute: blockers ─────────────────────────────────────────────────
        var blockerStats = new
        {
            total      = blockers.Count,
            open       = blockers.Count(b => b.Status == BlockerStatus.Open),
            inProgress = blockers.Count(b => b.Status == BlockerStatus.InProgress),
            resolved   = blockers.Count(b => b.Status == BlockerStatus.Resolved),
        };

        // ── Compute: velocity + team velocity ─────────────────────────────────
        var velocity = new
        {
            hasSession     = currentSession is not null,
            totalPoints    = currentTickets.Sum(t => t.FinalPoints ?? 0),
            ticketCount    = currentTickets.Count,
            estimatedCount = currentTickets.Count(t => t.FinalPoints.HasValue),
        };

        // allSprints is ordered desc (newest first) — reverse for chart
        var teamVelocity = allSprints.AsEnumerable().Reverse().Select(s =>
        {
            var sess       = allPokerSessions.FirstOrDefault(ps => ps.SprintId == s.Id);
            var sprintTix  = sess is not null ? allTickets.Where(t => t.PokerSessionId == sess.Id).ToList() : [];
            return new
            {
                sprintId     = s.Id,
                sprintName   = s.Name,
                sprintStatus = s.Status,
                totalPoints  = sprintTix.Sum(t => t.FinalPoints ?? 0),
                ticketCount  = sprintTix.Count,
                hasSession   = sess is not null,
            };
        }).ToList();

        // ── Compute: poker consensus ──────────────────────────────────────────
        var consensusTickets = currentTickets.Select(ticket =>
        {
            var ticketVotes       = votes.Where(v => v.PokerTicketId == ticket.Id).ToList();
            var numericEstimates  = ticketVotes
                .Where(v => int.TryParse(v.Estimate, out _))
                .Select(v => int.Parse(v.Estimate))
                .ToList();
            int? spread = numericEstimates.Count >= 2
                ? numericEstimates.Max() - numericEstimates.Min()
                : (int?)null;
            return new
            {
                ticketId    = ticket.Id,
                title       = ticket.Title,
                finalPoints = ticket.FinalPoints,
                estimates   = ticketVotes.Select(v => v.Estimate).ToList(),
                voteCount   = ticketVotes.Count,
                spread,
            };
        }).ToList();

        var spreadValues  = consensusTickets.Where(t => t.spread.HasValue).Select(t => (double)t.spread!.Value).ToList();
        var pokerConsensus = new
        {
            avgSpread = spreadValues.Count > 0 ? (double?)Math.Round(spreadValues.Average(), 1) : null,
            tickets   = consensusTickets,
        };

        // ── Projected members (safe for serialisation) ────────────────────────
        var members = teamMembers.Select(m => new
        {
            userId      = m.UserId,
            displayName = m.DisplayName,
            role        = m.Role,
        }).ToList();

        return Ok(new
        {
            sprint = new
            {
                id        = sprint.Id,
                name      = sprint.Name,
                startDate = sprint.StartDate,
                endDate   = sprint.EndDate,
                status    = sprint.Status,
                goal      = sprint.Goal,
            },
            members,
            capacity,
            mood,
            actionItems,
            blockers      = blockerStats,
            velocity,
            teamVelocity,
            pokerConsensus,
        });
    }
}
