using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class HealthController(SupabaseService sb) : ControllerBase
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

    // GET /api/teams/{teamId}/sprints/{sprintId}/health
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/health")]
    public async Task<IActionResult> GetHealth(Guid teamId, Guid sprintId)
    {
        if (!await IsMember(teamId)) return Forbid();

        // ── Batch 1: sprint + team ────────────────────────────────────────────
        var sprintTask = sb.Db.From<Sprint>()
            .Select("*, sprint_members(*)")
            .Filter("id",      Operator.Equals, sprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get();
        var teamTask = sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, teamId.ToString())
            .Get();
        await Task.WhenAll((Task)sprintTask, (Task)teamTask);

        var sprint = (await sprintTask).Models.FirstOrDefault();
        if (sprint is null) return NotFound();
        var teamMembers = (await teamTask).Models.FirstOrDefault()?.Members ?? [];

        // ── Batch 2: action items, blockers, retro sessions, recent sprints ───
        var actionsTask    = sb.Db.From<ActionItem>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get();
        var blockersTask   = sb.Db.From<Blocker>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get();
        var retrosTask     = sb.Db.From<RetroSession>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get();
        var allSprintsTask = sb.Db.From<Sprint>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("start_date", Ordering.Descending)
            .Limit(8)
            .Get();
        await Task.WhenAll((Task)actionsTask, (Task)blockersTask, (Task)retrosTask, (Task)allSprintsTask);

        var actions    = (await actionsTask).Models;
        var blockers   = (await blockersTask).Models;
        var retros     = (await retrosTask).Models;
        var allSprints = (await allSprintsTask).Models;

        // ── Mood checkins (separate query keyed to retro session IDs) ─────────
        List<MoodCheckin> allCheckins = [];
        if (retros.Count > 0)
        {
            var retroIds = retros.Select(r => r.Id.ToString()).ToList();
            allCheckins = (await sb.Db.From<MoodCheckin>()
                .Filter("retro_session_id", Operator.In, retroIds)
                .Get()).Models;
        }

        // ── Batch 3: poker sessions for all recent team sprints ───────────────
        var allSprintIds = allSprints.Select(s => s.Id.ToString()).ToList();
        List<PokerSession> allPokerSessions = [];
        if (allSprintIds.Count > 0)
        {
            allPokerSessions = (await sb.Db.From<PokerSession>()
                .Filter("sprint_id", Operator.In, allSprintIds)
                .Get()).Models;
        }

        // ── Batch 4: tickets for all those sessions ───────────────────────────
        var allSessionIds = allPokerSessions.Select(s => s.Id.ToString()).ToList();
        List<PokerTicket> allTickets = [];
        if (allSessionIds.Count > 0)
        {
            allTickets = (await sb.Db.From<PokerTicket>()
                .Filter("poker_session_id", Operator.In, allSessionIds)
                .Get()).Models;
        }

        // ── Batch 5: votes for this sprint's tickets ──────────────────────────
        var currentSession = allPokerSessions.FirstOrDefault(s => s.SprintId == sprintId);
        var currentTickets = currentSession is not null
            ? allTickets.Where(t => t.PokerSessionId == currentSession.Id).ToList()
            : [];
        List<PokerVote> votes = [];
        if (currentTickets.Count > 0)
        {
            var ticketIds = currentTickets.Select(t => t.Id.ToString()).ToList();
            votes = (await sb.Db.From<PokerVote>()
                .Filter("poker_ticket_id", Operator.In, ticketIds)
                .Get()).Models;
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
