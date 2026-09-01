using Backend.Data;
using Backend.Models;
using Backend.Realtime;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Npgsql;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class RetroController(AppDbContext db, RetroParticipantService participants, ILiveNotifier live)
    : ControllerBase
{
    // Matches the MaxLength on RetroSession.IcebreakerQuestion.
    private const int MaxIcebreakerLength = 500;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private static readonly RetroPhase[] PhaseOrder =
    [
        RetroPhase.CheckIn, RetroPhase.Icebreaker, RetroPhase.Write,
        RetroPhase.Group,   RetroPhase.Vote,        RetroPhase.Discuss,
        RetroPhase.WrapUp,  RetroPhase.Completed,
    ];

    private Task<bool> IsMember(Guid teamId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

    // Team members can always act. Invite-link joiners (anonymous or logged-in
    // guests who aren't on the team) can act if they've joined this specific
    // retro session via the invite link. EE-156.
    private async Task<bool> IsMemberOrParticipant(Guid teamId, Guid sessionId)
    {
        if (await IsMember(teamId)) return true;

        return await db.RetroParticipants.AsNoTracking()
            .AnyAsync(p => p.RetroSessionId == sessionId && p.UserId == CurrentUserId);
    }

    // Verify sprint belongs to team, then load retro session for that sprint.
    private async Task<(Sprint? sprint, RetroSession? session)> GetSprintAndSession(Guid teamId, Guid sprintId)
    {
        var sprint = await db.Sprints.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sprintId && s.TeamId == teamId);
        if (sprint is null) return (null, null);

        var session = await db.RetroSessions.FirstOrDefaultAsync(s => s.SprintId == sprintId);
        return (sprint, session);
    }

    // Load session by ID, verify the sprint it belongs to is in the given team.
    private async Task<RetroSession?> GetSessionById(Guid teamId, Guid sessionId)
    {
        var session = await db.RetroSessions.FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null || !session.SprintId.HasValue) return null;

        var belongsToTeam = await db.Sprints.AsNoTracking()
            .AnyAsync(s => s.Id == session.SprintId.Value && s.TeamId == teamId);

        return belongsToTeam ? session : null;
    }

    private static RetroPhase NextPhase(RetroSession session)
    {
        var idx = Array.IndexOf(PhaseOrder, session.Phase);
        var next = idx >= 0 && idx < PhaseOrder.Length - 1
            ? PhaseOrder[idx + 1]
            : RetroPhase.Completed;

        // The icebreaker round is opt-out, so hop straight to Write.
        if (next == RetroPhase.Icebreaker && session.SkipIcebreaker)
            next = RetroPhase.Write;

        return next;
    }

    // ─── Create ──────────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/sprints/{sprintId}/retro
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/retro")]
    public async Task<IActionResult> CreateRetro(
        Guid teamId, Guid sprintId, [FromBody] CreateRetroRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var sprint = await db.Sprints.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sprintId && s.TeamId == teamId);
        if (sprint is null) return NotFound("Sprint not found.");

        // Idempotent: return existing session if one already exists for this sprint
        var existing = await db.RetroSessions.AsNoTracking().FirstOrDefaultAsync(s => s.SprintId == sprintId);
        if (existing is not null) return Ok(existing);

        var session = new RetroSession
        {
            Name                   = sprint.Name,
            SprintId               = sprintId,
            FacilitatorId          = CurrentUserId,
            ColumnsJson            = req.ColumnsJson ?? """["Went Well","Improve","Learnings","Questions"]""",
            VoteCount              = req.VoteCount ?? 5,
            HideVotesUntilRevealed = req.HideVotesUntilRevealed ?? false,
            SkipIcebreaker         = req.SkipIcebreaker ?? false,
        };
        db.RetroSessions.Add(session);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Two concurrent calls raced to create the first session for this sprint —
            // the partial unique index on sprint_id (Phase 1, RetroSessionConfiguration)
            // rejects the loser. Re-read and return the winner instead of erroring,
            // matching this endpoint's existing idempotent contract. Same pattern as
            // RetroParticipantService.EnsureParticipantAsync's 23505 handling.
            var winner = await db.RetroSessions.AsNoTracking().FirstAsync(s => s.SprintId == sprintId);
            live.Touch(Topics.Retro(winner.Id));
            return Ok(winner);
        }

        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // ─── Get full state ───────────────────────────────────────────────────────

    // GET api/teams/{teamId}/sprints/{sprintId}/retro
    [HttpGet("api/teams/{teamId:guid}/sprints/{sprintId:guid}/retro")]
    public async Task<IActionResult> GetRetro(Guid teamId, Guid sprintId)
    {
        var (sprint, session) = await GetSprintAndSession(teamId, sprintId);
        if (sprint is null) return NotFound("Sprint not found.");
        if (session is null) return NotFound("No retro session exists for this sprint.");

        if (!await IsMemberOrParticipant(teamId, session.Id)) return Forbid();

        // Everyone who opens the retro gets a participant row, so the roster
        // (and the presence-based counters built on it) covers team members and
        // invite-link guests alike.
        await participants.EnsureParticipantAsync(session, User);

        var userId = CurrentUserId;

        // All cards (backend has no RLS to bypass — see architecture doc §4.1)
        var allCards = await db.RetroCards.AsNoTracking()
            .Include(c => c.Votes)
            .Where(c => c.RetroSessionId == session.Id)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        // Cards visible to current user: own + revealed
        var visibleCards = allCards
            .Where(c => c.IsRevealed || c.AuthorId == userId)
            .ToList();

        // Hidden card count per column (for Write phase face-down placeholders)
        var hiddenCounts = allCards
            .Where(c => !c.IsRevealed && c.AuthorId != userId)
            .GroupBy(c => c.Column)
            .ToDictionary(g => g.Key, g => g.Count());

        // Who has finished voting, captured before the filter below throws other
        // people's vote rows away. Facilitation progress must not depend on what
        // this particular user is allowed to see, and knowing *that* someone is
        // done doesn't reveal *what* they voted for. A partly spent budget still
        // leaves cards unranked, so only a fully spent one counts as finished.
        var finishedVotingUserIds = allCards
            .SelectMany(c => c.Votes)
            .GroupBy(v => v.UserId)
            .Where(g => g.Sum(v => v.Count) >= session.VoteCount)
            .Select(g => g.Key)
            .ToList();

        // If hide_votes_until_revealed is set and we're still in Vote phase,
        // strip other users' votes so they can't be seen
        if (session.HideVotesUntilRevealed && session.Phase == RetroPhase.Vote)
        {
            foreach (var card in visibleCards)
                card.Votes = card.Votes.Where(v => v.UserId == userId).ToList();
        }

        var moodCheckins = await db.MoodCheckins.AsNoTracking()
            .Where(m => m.RetroSessionId == session.Id)
            .ToListAsync();

        var teamMembers = await db.TeamMembers.AsNoTracking()
            .Where(m => m.TeamId == teamId)
            .ToListAsync();

        // Retro action items for this sprint — the Discuss panel renders them on
        // the card they came from and the wrap-up lists them per card (EE-160).
        var actionItems = await db.ActionItems.AsNoTracking()
            .Where(a => a.SprintId == sprintId && a.Type == ActionItemType.Retro)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();

        return Ok(new
        {
            Session      = session,
            Cards        = visibleCards,
            HiddenCounts = hiddenCounts,
            MoodCheckins = moodCheckins,
            TeamMembers  = teamMembers,
            ActionItems  = actionItems,
            Participants = await participants.GetParticipantsAsync(session.Id),
            FinishedVotingUserIds = finishedVotingUserIds,
            SprintName   = sprint.Name,
        });
    }

    // ─── Config ───────────────────────────────────────────────────────────────

    // PATCH api/teams/{teamId}/retro/{id}
    [HttpPatch("api/teams/{teamId:guid}/retro/{id:guid}")]
    public async Task<IActionResult> UpdateConfig(
        Guid teamId, Guid id, [FromBody] UpdateRetroConfigRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        if (req.ColumnsJson            is not null) session.ColumnsJson            = req.ColumnsJson;
        if (req.VoteCount.HasValue)                 session.VoteCount              = req.VoteCount.Value;
        if (req.HideVotesUntilRevealed.HasValue)    session.HideVotesUntilRevealed = req.HideVotesUntilRevealed.Value;

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // ─── Advance phase ────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/advance
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/advance")]
    public async Task<IActionResult> AdvancePhase(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();
        if (session.Phase == RetroPhase.Completed) return BadRequest("Retro is already completed.");

        var next = NextPhase(session);

        // Phase transition side-effects
        if (session.Phase == RetroPhase.CheckIn && next == RetroPhase.Icebreaker)
        {
            // Speaker order covers everyone who has joined the retro (team
            // members and invite-link guests), shuffled.
            var shuffled = await participants.BuildSpeakerOrderAsync(session, teamId);

            session.SpeakerOrderJson = JsonConvert.SerializeObject(shuffled);
            session.CurrentSpeakerId = shuffled.Any() ? Guid.Parse(shuffled[0]) : null;

            // Pick a random icebreaker
            var icebreakers = await db.Icebreakers.AsNoTracking().ToListAsync();
            if (icebreakers.Count > 0)
            {
                var pick = icebreakers[Random.Shared.Next(icebreakers.Count)];
                session.IcebreakerQuestion = pick.Text;
            }
        }
        else if (session.Phase == RetroPhase.Write && next == RetroPhase.Group)
        {
            // Reveal all cards simultaneously — bulk update instead of a
            // fetch-then-per-row-upsert (architecture doc §3.8).
            await db.RetroCards
                .Where(c => c.RetroSessionId == session.Id)
                .ExecuteUpdateAsync(c => c.SetProperty(x => x.IsRevealed, true));
        }

        session.Phase = next;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // ─── Cards ────────────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/cards
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/cards")]
    public async Task<IActionResult> AddCard(
        Guid teamId, Guid id, [FromBody] AddCardRequest req)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();
        if (session.Phase != RetroPhase.Write) return BadRequest("Cards can only be added during the Write phase.");
        if (string.IsNullOrWhiteSpace(req.Content)) return BadRequest("Content is required.");

        var card = new RetroCard
        {
            RetroSessionId = session.Id,
            AuthorId       = CurrentUserId,
            Column         = req.Column,
            Content        = req.Content.Trim(),
        };

        db.RetroCards.Add(card);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        card.Votes = new();
        return Ok(card);
    }

    // PATCH api/teams/{teamId}/retro/{id}/cards/{cardId}
    [HttpPatch("api/teams/{teamId:guid}/retro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> UpdateCard(
        Guid teamId, Guid id, Guid cardId, [FromBody] UpdateCardRequest req)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();

        var card = await db.RetroCards.FirstOrDefaultAsync(c => c.Id == cardId && c.RetroSessionId == id);
        if (card is null) return NotFound();

        // Content edit: own card, Write phase only
        if (req.Content is not null)
        {
            if (card.AuthorId != CurrentUserId || session.Phase != RetroPhase.Write)
                return Forbid();
            card.Content = req.Content.Trim();
        }

        // Grouping: Group phase, facilitator only
        if (req.GroupId is not null || req.GroupLabel is not null)
        {
            if (session.Phase != RetroPhase.Group)
                return BadRequest("Grouping is only allowed during the Group phase.");
            if (session.FacilitatorId != CurrentUserId) return Forbid();
            if (req.GroupId is not null)
                card.GroupId = req.GroupId == Guid.Empty ? null : req.GroupId;
            if (req.GroupLabel is not null)
                card.GroupLabel = string.IsNullOrWhiteSpace(req.GroupLabel) ? null : req.GroupLabel.Trim();
        }

        // Discussion notes: Discuss phase, any team member
        if (req.DiscussionNotes is not null)
        {
            if (session.Phase != RetroPhase.Discuss)
                return BadRequest("Discussion notes can only be edited during the Discuss phase.");
            card.DiscussionNotes = req.DiscussionNotes;
        }

        // Mark discussed: facilitator only
        if (req.IsDiscussed.HasValue)
        {
            if (session.FacilitatorId != CurrentUserId) return Forbid();
            card.IsDiscussed = req.IsDiscussed.Value;
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(card);
    }

    // DELETE api/teams/{teamId}/retro/{id}/cards/{cardId}
    [HttpDelete("api/teams/{teamId:guid}/retro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> DeleteCard(Guid teamId, Guid id, Guid cardId)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();
        if (session.Phase != RetroPhase.Write)
            return BadRequest("Cards can only be deleted during the Write phase.");

        var card = await db.RetroCards.FirstOrDefaultAsync(c => c.Id == cardId && c.RetroSessionId == id);
        if (card is null) return NotFound();
        if (card.AuthorId != CurrentUserId) return Forbid();

        db.RetroCards.Remove(card);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return NoContent();
    }

    // ─── Votes ────────────────────────────────────────────────────────────────

    // PUT api/teams/{teamId}/retro/{id}/votes
    // Body: full vote state for current user — replaces all existing votes
    [HttpPut("api/teams/{teamId:guid}/retro/{id:guid}/votes")]
    public async Task<IActionResult> UpsertVotes(
        Guid teamId, Guid id, [FromBody] List<VoteEntry> req)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();
        if (session.Phase != RetroPhase.Vote)
            return BadRequest("Voting is only allowed during the Vote phase.");

        var totalVotes = req.Sum(v => v.Count);
        if (totalVotes > session.VoteCount)
            return BadRequest($"Vote budget exceeded. Maximum is {session.VoteCount} votes.");

        // Get all card IDs in this session
        var cardIdGuids = await db.RetroCards.AsNoTracking()
            .Where(c => c.RetroSessionId == session.Id)
            .Select(c => c.Id)
            .ToListAsync();
        var cardIdStrings = cardIdGuids.Select(g => g.ToString()).ToHashSet();

        // Insert new votes (count > 0 only, skip invalid cardIds)
        var votes = req
            .Where(v => v.Count > 0 && cardIdStrings.Contains(v.CardId))
            .Select(v => new RetroVote
            {
                RetroCardId = Guid.Parse(v.CardId),
                UserId      = CurrentUserId,
                Count       = v.Count,
            }).ToList();

        // Delete-then-insert wrapped in one transaction, and the delete is now a
        // single statement instead of one round-trip per card — a failure between
        // the two used to lose the user's votes entirely (architecture doc §3.8).
        await using var tx = await db.Database.BeginTransactionAsync();

        await db.RetroVotes
            .Where(v => cardIdGuids.Contains(v.RetroCardId) && v.UserId == CurrentUserId)
            .ExecuteDeleteAsync();

        if (votes.Count > 0)
        {
            db.RetroVotes.AddRange(votes);
            await db.SaveChangesAsync();
        }

        await tx.CommitAsync();
        live.Touch(Topics.Retro(session.Id));

        return Ok(new { saved = votes.Count });
    }

    // ─── Mood ─────────────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/mood
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/mood")]
    public async Task<IActionResult> SubmitMood(
        Guid teamId, Guid id, [FromBody] MoodRequest req)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();

        // No range validation here, matching the pre-existing behaviour (unlike
        // QuickRetroController.SubmitMood, which does validate) — an out-of-range
        // value now hits the mood_checkins CHECK constraint restored in Phase 1
        // and returns a 500 with a clear check_violation instead of silently
        // corrupting the stored mood. Adding the same C# validation as
        // QuickRetroController would be a reasonable follow-up but is a product
        // behaviour change, not a mechanical Postgrest→EF conversion — out of
        // scope here.
        var existing = await db.MoodCheckins
            .FirstOrDefaultAsync(m => m.RetroSessionId == id && m.UserId == CurrentUserId);

        if (existing is null)
        {
            var checkin = new MoodCheckin
            {
                RetroSessionId = id,
                UserId         = CurrentUserId,
                EntryMood      = req.EntryMood,
                ExitMood       = req.ExitMood,
            };
            db.MoodCheckins.Add(checkin);
            await db.SaveChangesAsync();
            live.Touch(Topics.Retro(id));
            return Ok(checkin);
        }

        if (req.EntryMood.HasValue) existing.EntryMood = req.EntryMood;
        if (req.ExitMood.HasValue)  existing.ExitMood  = req.ExitMood;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(id));
        return Ok(existing);
    }

    // ─── Icebreaker ───────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/icebreaker/roll
    // With a `question` in the body the facilitator sets their own wording; the
    // custom text lives on the session only, it is not added to the icebreakers
    // library.
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/icebreaker/roll")]
    public async Task<IActionResult> RollIcebreaker(
        Guid teamId, Guid id, [FromBody] RollIcebreakerRequest? req = null)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var custom = req?.Question?.Trim();
        if (!string.IsNullOrEmpty(custom))
        {
            if (custom.Length > MaxIcebreakerLength)
                return BadRequest($"Question must be {MaxIcebreakerLength} characters or fewer.");

            session.IcebreakerQuestion = custom;
            await db.SaveChangesAsync();
            live.Touch(Topics.Retro(session.Id));
            return Ok(new { question = custom, category = "custom" });
        }

        var all = await db.Icebreakers.AsNoTracking().ToListAsync();
        if (all.Count == 0) return BadRequest("No icebreakers available.");

        // Pick a different question if possible
        var others = all.Where(i => i.Text != session.IcebreakerQuestion).ToList();
        var pool   = others.Count > 0 ? others : all;
        var pick   = pool[Random.Shared.Next(pool.Count)];

        session.IcebreakerQuestion = pick.Text;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(new { question = pick.Text, category = pick.Category });
    }

    // ─── Speaker ──────────────────────────────────────────────────────────────

    // PATCH api/teams/{teamId}/retro/{id}/speaker
    [HttpPatch("api/teams/{teamId:guid}/retro/{id:guid}/speaker")]
    public async Task<IActionResult> AdvanceSpeaker(
        Guid teamId, Guid id, [FromBody] AdvanceSpeakerRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        if (req.SpeakerId.HasValue)
        {
            session.CurrentSpeakerId = req.SpeakerId;
        }
        else
        {
            // Advance to next in speaker order
            var order = session.SpeakerOrderJson is null
                ? new List<string>()
                : JsonConvert.DeserializeObject<List<string>>(session.SpeakerOrderJson) ?? new();

            var current = session.CurrentSpeakerId?.ToString() ?? string.Empty;
            var idx     = order.IndexOf(current);

            session.CurrentSpeakerId = idx >= 0 && idx < order.Count - 1
                ? Guid.Parse(order[idx + 1])
                : null; // End of queue
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // ─── Discuss ──────────────────────────────────────────────────────────────

    // PATCH api/teams/{teamId}/retro/{id}/discuss
    [HttpPatch("api/teams/{teamId:guid}/retro/{id:guid}/discuss")]
    public async Task<IActionResult> SetActiveDiscussion(
        Guid teamId, Guid id, [FromBody] SetDiscussRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        session.ActiveDiscussionCardId = req.CardId;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // ─── Action Items ─────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/action-items
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/action-items")]
    public async Task<IActionResult> CreateActionItem(
        Guid teamId, Guid id, [FromBody] CreateRetroActionItemRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!session.SprintId.HasValue)
            return BadRequest("Retro session is not attached to a sprint.");

        // Only accept a card that actually belongs to this session.
        Guid? retroCardId = null;
        if (req.RetroCardId.HasValue)
        {
            var cardExists = await db.RetroCards.AsNoTracking()
                .AnyAsync(c => c.Id == req.RetroCardId.Value && c.RetroSessionId == session.Id);
            if (!cardExists) return BadRequest("Card does not belong to this retro session.");
            retroCardId = req.RetroCardId;
        }

        var item = new ActionItem
        {
            SprintId       = session.SprintId.Value,
            RetroSessionId = session.Id,
            Type           = ActionItemType.Retro,
            AssigneeId     = req.AssigneeId,
            Text           = req.Text.Trim(),
            // Request DTO carries DateTime? (a plain date picker payload); the model's
            // DueDate is DateOnly? (architecture doc §3.5) — narrow at this one call site.
            DueDate        = req.DueDate.HasValue ? DateOnly.FromDateTime(req.DueDate.Value) : null,
            Status         = ActionItemStatus.Open,
            RetroCardId    = retroCardId,
        };

        db.ActionItems.Add(item);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(item);
    }
}

// ─── Request / Response DTOs ──────────────────────────────────────────────────

public record CreateRetroRequest(
    string? ColumnsJson,
    int?    VoteCount,
    bool?   HideVotesUntilRevealed,
    bool?   SkipIcebreaker);

public record UpdateRetroConfigRequest(
    string? ColumnsJson,
    int?    VoteCount,
    bool?   HideVotesUntilRevealed);

public record AddCardRequest(string Column, string Content);

public class UpdateCardRequest
{
    public string? Content         { get; init; }
    public Guid?   GroupId         { get; init; }
    public string? GroupLabel      { get; init; }
    public string? DiscussionNotes { get; init; }
    public bool?   IsDiscussed     { get; init; }
}

public record VoteEntry(string CardId, int Count);

public record MoodRequest(int? EntryMood, int? ExitMood);

public record AdvanceSpeakerRequest(Guid? SpeakerId);

// Empty body (or no `question`) rolls a random one; a `question` sets it manually.
public record RollIcebreakerRequest(string? Question);

public record SetDiscussRequest(Guid? CardId);

public record CreateRetroActionItemRequest(
    string    Text,
    Guid?     AssigneeId,
    DateTime? DueDate,
    Guid?     RetroCardId);
