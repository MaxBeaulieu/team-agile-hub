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
public class QuickRetroController(SupabaseService sb) : ControllerBase
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

    /// <summary>
    /// Loads a personal (sprint-less) retro session owned by the current user.
    /// Sprint/team retros are deliberately excluded from this surface: they can
    /// contain other members' cards, and this flow reports a single participant.
    /// They stay reachable through the dashboard retro endpoints.
    /// </summary>
    private async Task<RetroSession?> GetOwnedSession(Guid sessionId)
    {
        var session = (await sb.Db.From<RetroSession>()
            .Filter("id", Operator.Equals, sessionId.ToString())
            .Filter("facilitator_id", Operator.Equals, CurrentUserId.ToString())
            .Get()).Models.FirstOrDefault();

        if (session is null || session.SprintId.HasValue) return null;
        return session;
    }

    private TeamMember CurrentUserAsParticipant(DateTime joinedAt)
    {
        var fallbackName = User.FindFirstValue("email")?.Split('@')[0] ?? "You";
        var displayName = User.FindFirstValue("name")
            ?? User.FindFirstValue("preferred_username")
            ?? fallbackName;

        return new TeamMember
        {
            Id = CurrentUserId,
            TeamId = Guid.Empty,
            UserId = CurrentUserId,
            DisplayName = displayName,
            Role = TeamRole.Admin,
            JoinedAt = joinedAt,
        };
    }

    private static RetroPhase NextPhase(RetroPhase current)
    {
        var idx = Array.IndexOf(PhaseOrder, current);
        return idx >= 0 && idx < PhaseOrder.Length - 1
            ? PhaseOrder[idx + 1]
            : RetroPhase.Completed;
    }

    // GET api/quickretro
    [HttpGet("api/quickretro")]
    public async Task<IActionResult> ListMine()
    {
        var sessions = (await sb.Db.From<RetroSession>()
            .Filter("facilitator_id", Operator.Equals, CurrentUserId.ToString())
            .Order("created_at", Ordering.Descending)
            .Get()).Models
            .Where(s => !s.SprintId.HasValue)
            .ToList();

        return Ok(sessions);
    }

    // POST api/quickretro
    [HttpPost("api/quickretro")]
    public async Task<IActionResult> CreateQuickRetro([FromBody] QuickCreateRetroRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Retro name is required.");

        var session = new RetroSession
        {
            Name = req.Name.Trim(),
            SprintId = null,
            FacilitatorId = CurrentUserId,
            ColumnsJson = req.ColumnsJson ?? """["Went Well","Improve","Learnings","Questions"]""",
            VoteCount = req.VoteCount ?? 5,
            HideVotesUntilRevealed = req.HideVotesUntilRevealed ?? false,
        };

        var created = (await sb.Db.From<RetroSession>().Insert(session)).Models.First();
        return Ok(created);
    }

    // GET api/quickretro/{id}
    [HttpGet("api/quickretro/{id:guid}")]
    public async Task<IActionResult> GetQuickRetro(Guid id)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        var allCards = (await sb.Db.From<RetroCard>()
            .Select("*, retro_votes(*)")
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Order("created_at", Ordering.Ascending)
            .Get()).Models;

        // Personal retros only ever contain the owner's cards, so these guards
        // are no-ops today. They are kept so this endpoint stays correct if the
        // session scope is ever widened (e.g. shared/anonymous join).
        var visibleCards = allCards
            .Where(c => c.IsRevealed || c.AuthorId == CurrentUserId)
            .ToList();

        var hiddenCounts = allCards
            .Where(c => !c.IsRevealed && c.AuthorId != CurrentUserId)
            .GroupBy(c => c.Column)
            .ToDictionary(g => g.Key, g => g.Count());

        if (session.HideVotesUntilRevealed && session.Phase == RetroPhase.Vote)
        {
            foreach (var card in visibleCards)
                card.Votes = card.Votes.Where(v => v.UserId == CurrentUserId).ToList();
        }

        var moodCheckins = (await sb.Db.From<MoodCheckin>()
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Get()).Models;

        var participant = CurrentUserAsParticipant(session.CreatedAt);

        var actionItems = (await sb.Db.From<ActionItem>()
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Order("created_at", Ordering.Ascending)
            .Get()).Models;

        return Ok(new
        {
            Session = session,
            Cards = visibleCards,
            HiddenCounts = hiddenCounts,
            MoodCheckins = moodCheckins,
            TeamMembers = new List<TeamMember> { participant },
            ActionItems = actionItems,
            RetroName = session.Name,
        });
    }

    // POST api/quickretro/{id}/advance
    [HttpPost("api/quickretro/{id:guid}/advance")]
    public async Task<IActionResult> AdvancePhase(Guid id)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();
        if (session.Phase == RetroPhase.Completed) return BadRequest("Retro is already completed.");

        var next = NextPhase(session.Phase);

        if (session.Phase == RetroPhase.CheckIn && next == RetroPhase.Icebreaker)
        {
            var order = new List<string> { CurrentUserId.ToString() };
            session.SpeakerOrderJson = JsonConvert.SerializeObject(order);
            session.CurrentSpeakerId = CurrentUserId;

            var icebreakers = (await sb.Db.From<Icebreaker>().Get()).Models;
            if (icebreakers.Any())
            {
                var pick = icebreakers[Random.Shared.Next(icebreakers.Count)];
                session.IcebreakerQuestion = pick.Text;
            }
        }
        else if (session.Phase == RetroPhase.Write && next == RetroPhase.Group)
        {
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

    // POST api/quickretro/{id}/cards
    [HttpPost("api/quickretro/{id:guid}/cards")]
    public async Task<IActionResult> AddCard(Guid id, [FromBody] QuickAddCardRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Write) return BadRequest("Cards can only be added during the Write phase.");
        if (string.IsNullOrWhiteSpace(req.Content)) return BadRequest("Content is required.");

        // Reject columns that are not part of this retro, otherwise the card is
        // persisted but never rendered by the board.
        var columns = JsonConvert.DeserializeObject<List<string>>(session.ColumnsJson) ?? [];
        if (!columns.Contains(req.Column))
            return BadRequest("Unknown column for this retro.");

        var card = new RetroCard
        {
            RetroSessionId = session.Id,
            AuthorId = CurrentUserId,
            Column = req.Column,
            Content = req.Content.Trim(),
        };

        var inserted = (await sb.Db.From<RetroCard>().Insert(card)).Models.First();
        inserted.Votes = new();
        return Ok(inserted);
    }

    // PATCH api/quickretro/{id}/cards/{cardId}
    [HttpPatch("api/quickretro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> UpdateCard(Guid id, Guid cardId, [FromBody] QuickUpdateCardRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        var card = (await sb.Db.From<RetroCard>()
            .Filter("id", Operator.Equals, cardId.ToString())
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (card is null) return NotFound();

        if (req.Content is not null)
        {
            if (card.AuthorId != CurrentUserId || session.Phase != RetroPhase.Write)
                return Forbid();
            card.Content = req.Content.Trim();
        }

        if (req.GroupId is not null || req.GroupLabel is not null)
        {
            if (session.Phase != RetroPhase.Group)
                return BadRequest("Grouping is only allowed during the Group phase.");
            if (req.GroupId is not null)
                card.GroupId = req.GroupId == Guid.Empty ? null : req.GroupId;
            if (req.GroupLabel is not null)
                card.GroupLabel = string.IsNullOrWhiteSpace(req.GroupLabel) ? null : req.GroupLabel.Trim();
        }

        if (req.DiscussionNotes is not null)
        {
            if (session.Phase != RetroPhase.Discuss)
                return BadRequest("Discussion notes can only be edited during the Discuss phase.");
            card.DiscussionNotes = req.DiscussionNotes;
        }

        if (req.IsDiscussed.HasValue)
            card.IsDiscussed = req.IsDiscussed.Value;

        await sb.Db.From<RetroCard>().Update(card);
        return Ok(card);
    }

    // DELETE api/quickretro/{id}/cards/{cardId}
    [HttpDelete("api/quickretro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> DeleteCard(Guid id, Guid cardId)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Write)
            return BadRequest("Cards can only be deleted during the Write phase.");

        var card = (await sb.Db.From<RetroCard>()
            .Filter("id", Operator.Equals, cardId.ToString())
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (card is null) return NotFound();
        if (card.AuthorId != CurrentUserId) return Forbid();

        await sb.Db.From<RetroCard>()
            .Filter("id", Operator.Equals, cardId.ToString())
            .Delete();
        return NoContent();
    }

    // PUT api/quickretro/{id}/votes
    [HttpPut("api/quickretro/{id:guid}/votes")]
    public async Task<IActionResult> UpsertVotes(Guid id, [FromBody] List<QuickVoteEntry> req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Vote)
            return BadRequest("Voting is only allowed during the Vote phase.");

        var totalVotes = req.Sum(v => v.Count);
        if (totalVotes > session.VoteCount)
            return BadRequest($"Vote budget exceeded. Maximum is {session.VoteCount} votes.");

        var cardIds = (await sb.Db.From<RetroCard>()
            .Select("id")
            .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
            .Get()).Models.Select(c => c.Id.ToString()).ToHashSet();

        // Replace this user's votes for the session in a single round trip.
        if (cardIds.Count > 0)
        {
            await sb.Db.From<RetroVote>()
                .Filter("retro_card_id", Operator.In, cardIds.ToList())
                .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
                .Delete();
        }

        var votes = req
            .Where(v => v.Count > 0 && cardIds.Contains(v.CardId))
            .Select(v => new RetroVote
            {
                RetroCardId = Guid.Parse(v.CardId),
                UserId = CurrentUserId,
                Count = v.Count,
            }).ToList();

        if (votes.Any()) await sb.Db.From<RetroVote>().Insert(votes);

        return Ok(new { saved = votes.Count });
    }

    // POST api/quickretro/{id}/mood
    [HttpPost("api/quickretro/{id:guid}/mood")]
    public async Task<IActionResult> SubmitMood(Guid id, [FromBody] QuickMoodRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        var existing = (await sb.Db.From<MoodCheckin>()
            .Filter("retro_session_id", Operator.Equals, id.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is null)
        {
            var checkin = new MoodCheckin
            {
                RetroSessionId = id,
                UserId = CurrentUserId,
                EntryMood = req.EntryMood,
                ExitMood = req.ExitMood,
            };
            var inserted = (await sb.Db.From<MoodCheckin>().Insert(checkin)).Models.First();
            return Ok(inserted);
        }

        if (req.EntryMood.HasValue) existing.EntryMood = req.EntryMood;
        if (req.ExitMood.HasValue) existing.ExitMood = req.ExitMood;
        await sb.Db.From<MoodCheckin>().Update(existing);
        return Ok(existing);
    }

    // POST api/quickretro/{id}/icebreaker/roll
    [HttpPost("api/quickretro/{id:guid}/icebreaker/roll")]
    public async Task<IActionResult> RollIcebreaker(Guid id)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        var all = (await sb.Db.From<Icebreaker>().Get()).Models;
        if (!all.Any()) return BadRequest("No icebreakers available.");

        var others = all.Where(i => i.Text != session.IcebreakerQuestion).ToList();
        var pool = others.Any() ? others : all;
        var pick = pool[Random.Shared.Next(pool.Count)];

        session.IcebreakerQuestion = pick.Text;
        await sb.Db.From<RetroSession>().Update(session);
        return Ok(new { question = pick.Text, category = pick.Category });
    }

    // PATCH api/quickretro/{id}/speaker
    [HttpPatch("api/quickretro/{id:guid}/speaker")]
    public async Task<IActionResult> AdvanceSpeaker(Guid id, [FromBody] QuickAdvanceSpeakerRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        if (req.SpeakerId.HasValue)
        {
            session.CurrentSpeakerId = req.SpeakerId;
        }
        else
        {
            var order = session.SpeakerOrderJson is null
                ? new List<string>()
                : JsonConvert.DeserializeObject<List<string>>(session.SpeakerOrderJson) ?? new();

            var current = session.CurrentSpeakerId?.ToString() ?? string.Empty;
            var idx = order.IndexOf(current);

            session.CurrentSpeakerId = idx >= 0 && idx < order.Count - 1
                ? Guid.Parse(order[idx + 1])
                : null;
        }

        await sb.Db.From<RetroSession>().Update(session);
        return Ok(session);
    }

    // PATCH api/quickretro/{id}/discuss
    [HttpPatch("api/quickretro/{id:guid}/discuss")]
    public async Task<IActionResult> SetActiveDiscussion(Guid id, [FromBody] QuickSetDiscussRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();

        session.ActiveDiscussionCardId = req.CardId;
        await sb.Db.From<RetroSession>().Update(session);
        return Ok(session);
    }

    // POST api/quickretro/{id}/action-items
    [HttpPost("api/quickretro/{id:guid}/action-items")]
    public async Task<IActionResult> CreateActionItem(Guid id, [FromBody] QuickCreateActionItemRequest req)
    {
        var session = await GetOwnedSession(id);
        if (session is null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest("Text is required.");

        // Only accept a card that actually belongs to this session.
        Guid? retroCardId = null;
        if (req.RetroCardId.HasValue)
        {
            var card = (await sb.Db.From<RetroCard>()
                .Filter("id", Operator.Equals, req.RetroCardId.Value.ToString())
                .Filter("retro_session_id", Operator.Equals, session.Id.ToString())
                .Get()).Models.FirstOrDefault();
            if (card is null) return BadRequest("Card does not belong to this retro session.");
            retroCardId = card.Id;
        }

        var item = new ActionItem
        {
            SprintId = null,
            RetroSessionId = session.Id,
            RetroCardId = retroCardId,
            Type = ActionItemType.Retro,
            Text = req.Text.Trim(),
            Status = ActionItemStatus.Open,
        };

        var inserted = (await sb.Db.From<ActionItem>().Insert(item)).Models.First();
        return Ok(inserted);
    }
}

public record QuickCreateRetroRequest(
    string Name,
    string? ColumnsJson,
    int? VoteCount,
    bool? HideVotesUntilRevealed);

public record QuickAddCardRequest(string Column, string Content);

public class QuickUpdateCardRequest
{
    public string? Content { get; init; }
    public Guid? GroupId { get; init; }
    public string? GroupLabel { get; init; }
    public string? DiscussionNotes { get; init; }
    public bool? IsDiscussed { get; init; }
}

public record QuickVoteEntry(string CardId, int Count);

public record QuickMoodRequest(int? EntryMood, int? ExitMood);

public record QuickAdvanceSpeakerRequest(Guid? SpeakerId);

public record QuickSetDiscussRequest(Guid? CardId);

public record QuickCreateActionItemRequest(string Text, Guid? RetroCardId);
