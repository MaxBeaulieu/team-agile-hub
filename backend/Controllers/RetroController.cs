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
public class RetroController(SupabaseService sb) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private static readonly RetroPhase[] PhaseOrder =
    [
        RetroPhase.CheckIn, RetroPhase.Icebreaker, RetroPhase.Write,
        RetroPhase.Group,   RetroPhase.Vote,        RetroPhase.Discuss,
        RetroPhase.WrapUp,  RetroPhase.Completed,
    ];

    private async Task<bool> IsMember(Guid teamId)
    {
        var r = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();
        return r.Models.Any();
    }

    // Team members can always act. Invite-link joiners (anonymous or logged-in
    // guests who aren't on the team) can act if they've joined this specific
    // retro session via the invite link. EE-156.
    private async Task<bool> IsMemberOrParticipant(Guid teamId, Guid sessionId)
    {
        if (await IsMember(teamId)) return true;

        var r = await sb.Db.From<RetroParticipant>()
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Filter("user_id",          Operator.Equals, CurrentUserId.ToString())
            .Get();
        return r.Models.Any();
    }

    // Verify sprint belongs to team, then load retro session for that sprint.
    private async Task<(Sprint? sprint, RetroSession? session)> GetSprintAndSession(Guid teamId, Guid sprintId)
    {
        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id",      Operator.Equals, sprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (sprint is null) return (null, null);

        var session = (await sb.Db.From<RetroSession>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get()).Models.FirstOrDefault();

        return (sprint, session);
    }

    // Load session by ID, verify the sprint it belongs to is in the given team.
    private async Task<RetroSession?> GetSessionById(Guid teamId, Guid sessionId)
    {
        var session = (await sb.Db.From<RetroSession>()
            .Filter("id", Operator.Equals, sessionId.ToString())
            .Get()).Models.FirstOrDefault();
        if (session is null) return null;

        if (!session.SprintId.HasValue) return null;

        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id",      Operator.Equals, session.SprintId.Value.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        return sprint is null ? null : session;
    }

    private static RetroPhase NextPhase(RetroPhase current)
    {
        var idx = Array.IndexOf(PhaseOrder, current);
        return idx >= 0 && idx < PhaseOrder.Length - 1
            ? PhaseOrder[idx + 1]
            : RetroPhase.Completed;
    }

    // ─── Create ──────────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/sprints/{sprintId}/retro
    [HttpPost("api/teams/{teamId:guid}/sprints/{sprintId:guid}/retro")]
    public async Task<IActionResult> CreateRetro(
        Guid teamId, Guid sprintId, [FromBody] CreateRetroRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();

        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id",      Operator.Equals, sprintId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (sprint is null) return NotFound("Sprint not found.");

        // Idempotent: return existing session if one already exists for this sprint
        var existing = (await sb.Db.From<RetroSession>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Get()).Models.FirstOrDefault();
        if (existing is not null) return Ok(existing);

        var session = new RetroSession
        {
            Name                   = sprint.Name,
            SprintId               = sprintId,
            FacilitatorId          = CurrentUserId,
            ColumnsJson            = req.ColumnsJson ?? """["Went Well","Improve","Learnings","Questions"]""",
            VoteCount              = req.VoteCount ?? 5,
            HideVotesUntilRevealed = req.HideVotesUntilRevealed ?? false,
        };

        var created = (await sb.Db.From<RetroSession>().Insert(session)).Models.First();
        return Ok(created);
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

        var userId = CurrentUserId;

        // All cards (backend bypasses RLS)
        var allCards = (await sb.Db.From<RetroCard>()
            .Select("*, retro_votes(*)")
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Order("created_at", Ordering.Ascending)
            .Get()).Models;

        // Cards visible to current user: own + revealed
        var visibleCards = allCards
            .Where(c => c.IsRevealed || c.AuthorId == userId)
            .ToList();

        // Hidden card count per column (for Write phase face-down placeholders)
        var hiddenCounts = allCards
            .Where(c => !c.IsRevealed && c.AuthorId != userId)
            .GroupBy(c => c.Column)
            .ToDictionary(g => g.Key, g => g.Count());

        // If hide_votes_until_revealed is set and we're still in Vote phase,
        // strip other users' votes so they can't be seen
        if (session.HideVotesUntilRevealed && session.Phase == RetroPhase.Vote)
        {
            foreach (var card in visibleCards)
                card.Votes = card.Votes.Where(v => v.UserId == userId).ToList();
        }

        var moodCheckins = (await sb.Db.From<MoodCheckin>()
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Get()).Models;

        var teamMembers = (await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault()?.Members ?? new();

        // Retro action items for this sprint — the Discuss panel renders them on
        // the card they came from and the wrap-up lists them per card (EE-160).
        var actionItems = (await sb.Db.From<ActionItem>()
            .Filter("sprint_id", Operator.Equals, sprintId.ToString())
            .Filter("type",      Operator.Equals, "retro")
            .Order("created_at", Ordering.Ascending)
            .Get()).Models;

        return Ok(new
        {
            Session      = session,
            Cards        = visibleCards,
            HiddenCounts = hiddenCounts,
            MoodCheckins = moodCheckins,
            TeamMembers  = teamMembers,
            ActionItems  = actionItems,
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

        await sb.Db.From<RetroSession>().Update(session);
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

        var next = NextPhase(session.Phase);

        // Phase transition side-effects
        if (session.Phase == RetroPhase.CheckIn && next == RetroPhase.Icebreaker)
        {
            // Shuffle team members for speaker order
            var members = (await sb.Db.From<TeamMember>()
                .Filter("team_id", Operator.Equals, teamId.ToString())
                .Get()).Models;

            var shuffled = members
                .Select(m => m.UserId.ToString())
                .OrderBy(_ => Random.Shared.Next())
                .ToList();

            session.SpeakerOrderJson = JsonConvert.SerializeObject(shuffled);
            session.CurrentSpeakerId = shuffled.Any() ? Guid.Parse(shuffled[0]) : null;

            // Pick a random icebreaker
            var icebreakers = (await sb.Db.From<Icebreaker>().Get()).Models;
            if (icebreakers.Any())
            {
                var pick = icebreakers[Random.Shared.Next(icebreakers.Count)];
                session.IcebreakerQuestion = pick.Text;
            }
        }
        else if (session.Phase == RetroPhase.Write && next == RetroPhase.Group)
        {
            // Reveal all cards simultaneously
            var cards = (await sb.Db.From<RetroCard>()
                .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
                .Get()).Models;

            foreach (var c in cards) c.IsRevealed = true;
            if (cards.Any()) await sb.Db.From<RetroCard>().Upsert(cards);
        }

        session.Phase = next;
        await sb.Db.From<RetroSession>().Update(session);
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

        var inserted = (await sb.Db.From<RetroCard>().Insert(card)).Models.First();
        inserted.Votes = new();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/retro/{id}/cards/{cardId}
    [HttpPatch("api/teams/{teamId:guid}/retro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> UpdateCard(
        Guid teamId, Guid id, Guid cardId, [FromBody] UpdateCardRequest req)
    {
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (!await IsMemberOrParticipant(teamId, id)) return Forbid();

        var card = (await sb.Db.From<RetroCard>()
            .Filter("id",               Operator.Equals, cardId.ToString())
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (card is null) return NotFound();

        // Content edit: own card, Write phase only
        if (req.Content is not null)
        {
            if (card.AuthorId != CurrentUserId || session.Phase != RetroPhase.Write)
                return Forbid();
            card.Content = req.Content.Trim();
        }

        // Grouping: Group phase, any team member
        if (req.GroupId is not null || req.GroupLabel is not null)
        {
            if (session.Phase != RetroPhase.Group)
                return BadRequest("Grouping is only allowed during the Group phase.");
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

        await sb.Db.From<RetroCard>().Update(card);
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

        var card = (await sb.Db.From<RetroCard>()
            .Filter("id",               Operator.Equals, cardId.ToString())
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (card is null) return NotFound();
        if (card.AuthorId != CurrentUserId) return Forbid();

        await sb.Db.From<RetroCard>()
            .Filter("id", Operator.Equals, cardId.ToString())
            .Delete();
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
        var cardIds = (await sb.Db.From<RetroCard>()
            .Select("id")
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Get()).Models.Select(c => c.Id.ToString()).ToHashSet();

        // Delete current user's votes for all cards in this session
        foreach (var cid in cardIds)
        {
            await sb.Db.From<RetroVote>()
                .Filter("retro_card_id", Operator.Equals, cid)
                .Filter("user_id",       Operator.Equals, CurrentUserId.ToString())
                .Delete();
        }

        // Insert new votes (count > 0 only, skip invalid cardIds)
        var votes = req
            .Where(v => v.Count > 0 && cardIds.Contains(v.CardId))
            .Select(v => new RetroVote
            {
                RetroCardId = Guid.Parse(v.CardId),
                UserId      = CurrentUserId,
                Count       = v.Count,
            }).ToList();

        if (votes.Any()) await sb.Db.From<RetroVote>().Insert(votes);

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

        var existing = (await sb.Db.From<MoodCheckin>()
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Filter("user_id",          Operator.Equals, CurrentUserId.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is null)
        {
            var checkin = new MoodCheckin
            {
                RetroSessionId = id,
                UserId         = CurrentUserId,
                EntryMood      = req.EntryMood,
                ExitMood       = req.ExitMood,
            };
            var inserted = (await sb.Db.From<MoodCheckin>().Insert(checkin)).Models.First();
            return Ok(inserted);
        }

        if (req.EntryMood.HasValue) existing.EntryMood = req.EntryMood;
        if (req.ExitMood.HasValue)  existing.ExitMood  = req.ExitMood;
        await sb.Db.From<MoodCheckin>().Update(existing);
        return Ok(existing);
    }

    // ─── Icebreaker ───────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/retro/{id}/icebreaker/roll
    [HttpPost("api/teams/{teamId:guid}/retro/{id:guid}/icebreaker/roll")]
    public async Task<IActionResult> RollIcebreaker(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();
        var session = await GetSessionById(teamId, id);
        if (session is null) return NotFound();
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var all = (await sb.Db.From<Icebreaker>().Get()).Models;
        if (!all.Any()) return BadRequest("No icebreakers available.");

        // Pick a different question if possible
        var others = all.Where(i => i.Text != session.IcebreakerQuestion).ToList();
        var pool   = others.Any() ? others : all;
        var pick   = pool[Random.Shared.Next(pool.Count)];

        session.IcebreakerQuestion = pick.Text;
        await sb.Db.From<RetroSession>().Update(session);
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

        await sb.Db.From<RetroSession>().Update(session);
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
        await sb.Db.From<RetroSession>().Update(session);
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
            var card = (await sb.Db.From<RetroCard>()
                .Filter("id",               Operator.Equals, req.RetroCardId.Value.ToString())
                .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
                .Get()).Models.FirstOrDefault();
            if (card is null) return BadRequest("Card does not belong to this retro session.");
            retroCardId = card.Id;
        }

        var item = new ActionItem
        {
            SprintId    = session.SprintId.Value,
            Type        = ActionItemType.Retro,
            AssigneeId  = req.AssigneeId,
            Text        = req.Text.Trim(),
            DueDate     = req.DueDate,
            Status      = ActionItemStatus.Open,
            RetroCardId = retroCardId,
        };

        var inserted = (await sb.Db.From<ActionItem>().Insert(item)).Models.First();
        return Ok(inserted);
    }
}

// ─── Request / Response DTOs ──────────────────────────────────────────────────

public record CreateRetroRequest(
    string? ColumnsJson,
    int?    VoteCount,
    bool?   HideVotesUntilRevealed);

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

public record SetDiscussRequest(Guid? CardId);

public record CreateRetroActionItemRequest(
    string    Text,
    Guid?     AssigneeId,
    DateTime? DueDate,
    Guid?     RetroCardId);
