using Backend.Data;
using Backend.Models;
using Backend.Realtime;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class QuickRetroController(AppDbContext db, RetroParticipantService participants, ILiveNotifier live)
    : ControllerBase
{
    // The [MaxLength] attributes on the models are documentation only: Postgrest
    // doesn't enforce them and the underlying columns are `text`, so anything a
    // client sends is stored verbatim unless it is checked here.
    private const int MaxNameLength       = 120;   // RetroSession.Name
    private const int MaxIcebreakerLength = 500;   // RetroSession.IcebreakerQuestion
    private const int MaxCardLength       = 1000;  // RetroCard.Content
    private const int MaxColumnLength     = 50;    // RetroCard.Column
    private const int MaxGroupLabelLength = 100;   // RetroCard.GroupLabel
    private const int MaxNotesLength      = 4000;  // RetroCard.DiscussionNotes
    private const int MaxActionItemLength = 500;   // ActionItem.Text

    /// <summary>Kept in step with MAX_TEMPLATE_COLUMNS on the client.</summary>
    private const int MaxColumns = 8;

    private const int MaxVoteCount = 20;
    private const int MinMood = 1;
    private const int MaxMood = 5;

    private const string DefaultColumnsJson = """["Went Well","Improve","Learnings","Questions"]""";

    private Guid CurrentUserId => RetroParticipantService.UserIdOf(User);

    private static readonly RetroPhase[] PhaseOrder =
    [
        RetroPhase.CheckIn, RetroPhase.Icebreaker, RetroPhase.Write,
        RetroPhase.Group,   RetroPhase.Vote,        RetroPhase.Discuss,
        RetroPhase.WrapUp,  RetroPhase.Completed,
    ];

    /// <summary>
    /// Loads a sprint-less retro session the current user may take part in:
    /// its facilitator, or anyone who joined through the invite link.
    /// Sprint/team retros are deliberately excluded from this surface — they
    /// stay reachable through the dashboard retro endpoints.
    /// </summary>
    private async Task<RetroSession?> GetAccessibleSession(Guid sessionId)
    {
        var session = await db.RetroSessions.FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session is null || session.SprintId.HasValue) return null;

        if (session.FacilitatorId == CurrentUserId) return session;

        return await participants.IsParticipantAsync(session.Id, CurrentUserId)
            ? session
            : null;
    }

    /// <summary>Host-only actions (phase, speaker, icebreaker, discussion focus).</summary>
    private async Task<RetroSession?> GetFacilitatedSession(Guid sessionId)
    {
        var session = await GetAccessibleSession(sessionId);
        return session?.FacilitatorId == CurrentUserId ? session : null;
    }

    private static RetroPhase NextPhase(RetroSession session)
    {
        var idx = Array.IndexOf(PhaseOrder, session.Phase);
        var next = idx >= 0 && idx < PhaseOrder.Length - 1
            ? PhaseOrder[idx + 1]
            : RetroPhase.Completed;

        // The icebreaker round is opt-out, so hop straight to Write (EE-165).
        if (next == RetroPhase.Icebreaker && session.SkipIcebreaker)
            next = RetroPhase.Write;

        return next;
    }

    /// <summary>Random icebreaker from the library, avoiding <paramref name="exclude"/> when possible.</summary>
    private async Task<Icebreaker?> PickIcebreakerAsync(string? exclude = null)
    {
        var all = await db.Icebreakers.AsNoTracking().ToListAsync();
        if (all.Count == 0) return null;

        var pool = all.Where(i => i.Text != exclude).ToList();
        if (pool.Count == 0) pool = all;
        return pool[Random.Shared.Next(pool.Count)];
    }

    private static List<string> ReadSpeakerOrder(RetroSession session) =>
        ReadStringArray(session.SpeakerOrderJson);

    private static List<string> ReadColumns(RetroSession session) =>
        ReadStringArray(session.ColumnsJson);

    /// <summary>Reads a JSON array column without letting bad data throw a 500.</summary>
    private static List<string> ReadStringArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonConvert.DeserializeObject<List<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// Validates the board columns a client asked for and hands back their
    /// canonical JSON. A retro whose <c>columns_json</c> is empty or unparsable
    /// renders as a blank, unusable board (and crashes the client's
    /// <c>JSON.parse</c>), so it must never reach the database.
    /// </summary>
    private static bool TryNormalizeColumns(string json, out string normalized, out string error)
    {
        normalized = string.Empty;
        error      = string.Empty;

        List<string?>? columns;
        try
        {
            columns = JsonConvert.DeserializeObject<List<string?>>(json);
        }
        catch (JsonException)
        {
            columns = null;
        }

        if (columns is null)
        {
            error = "Columns must be a JSON array of column names.";
            return false;
        }

        var cleaned = columns
            .Select(c => c?.Trim() ?? string.Empty)
            .Where(c => c.Length > 0)
            .ToList();

        if (cleaned.Count == 0)
        {
            error = "A retro needs at least one column.";
            return false;
        }
        if (cleaned.Count > MaxColumns)
        {
            error = $"A retro can have at most {MaxColumns} columns.";
            return false;
        }
        if (cleaned.Any(c => c.Length > MaxColumnLength))
        {
            error = $"Column names must be {MaxColumnLength} characters or fewer.";
            return false;
        }
        if (cleaned.Distinct(StringComparer.OrdinalIgnoreCase).Count() != cleaned.Count)
        {
            error = "Column names must be unique.";
            return false;
        }

        normalized = JsonConvert.SerializeObject(cleaned);
        return true;
    }

    /// <summary>Ids of every card on the board, for "does this id belong here?" checks.</summary>
    private async Task<HashSet<Guid>> GetCardIdsAsync(Guid sessionId) =>
        (await db.RetroCards.AsNoTracking()
            .Where(c => c.RetroSessionId == sessionId)
            .Select(c => c.Id)
            .ToListAsync())
            .ToHashSet();

    private static bool IsValidMood(int? mood) => mood is null or (>= MinMood and <= MaxMood);

    // GET api/quickretro
    [HttpGet("api/quickretro")]
    public async Task<IActionResult> ListMine()
    {
        var sessions = await db.RetroSessions.AsNoTracking()
            .Where(s => s.FacilitatorId == CurrentUserId && s.SprintId == null)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();

        return Ok(sessions);
    }

    // POST api/quickretro
    [HttpPost("api/quickretro")]
    public async Task<IActionResult> CreateQuickRetro([FromBody] QuickCreateRetroRequest req)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrEmpty(name))
            return BadRequest("Retro name is required.");
        if (name.Length > MaxNameLength)
            return BadRequest($"Retro name must be {MaxNameLength} characters or fewer.");

        if (!TryNormalizeColumns(req.ColumnsJson ?? DefaultColumnsJson, out var columnsJson, out var columnsError))
            return BadRequest(columnsError);

        var voteCount = req.VoteCount ?? 5;
        if (voteCount < 1 || voteCount > MaxVoteCount)
            return BadRequest($"Votes per person must be between 1 and {MaxVoteCount}.");

        var session = new RetroSession
        {
            Name = name,
            SprintId = null,
            FacilitatorId = CurrentUserId,
            ColumnsJson = columnsJson,
            VoteCount = voteCount,
            HideVotesUntilRevealed = req.HideVotesUntilRevealed ?? false,
            SkipMoodCheckins = req.SkipMoodCheckins ?? false,
            SkipIcebreaker = req.SkipIcebreaker ?? false,
        };

        // Without the mood ritual there is nothing to do in the Check-In phase,
        // so the retro opens on the icebreaker instead (EE-165) — or on Write
        // when the icebreaker is skipped too. The question is normally drawn
        // when leaving Check-In, so draw it here.
        if (session.SkipMoodCheckins)
        {
            session.Phase = session.SkipIcebreaker ? RetroPhase.Write : RetroPhase.Icebreaker;
            if (!session.SkipIcebreaker)
                session.IcebreakerQuestion = (await PickIcebreakerAsync())?.Text;
        }

        db.RetroSessions.Add(session);
        await db.SaveChangesAsync();
        return Ok(session);
    }

    // GET api/quickretro/{id}
    [HttpGet("api/quickretro/{id:guid}")]
    public async Task<IActionResult> GetQuickRetro(Guid id)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();

        await participants.EnsureParticipantAsync(session, User);

        var allCards = await db.RetroCards.AsNoTracking()
            .Include(c => c.Votes)
            .Where(c => c.RetroSessionId == session.Id)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        // Guests joining through the invite link share the board, so unrevealed
        // cards written by someone else stay hidden until the Group phase.
        var visibleCards = allCards
            .Where(c => c.IsRevealed || c.AuthorId == CurrentUserId)
            .ToList();

        var hiddenCounts = allCards
            .Where(c => !c.IsRevealed && c.AuthorId != CurrentUserId)
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

        if (session.HideVotesUntilRevealed && session.Phase == RetroPhase.Vote)
        {
            foreach (var card in visibleCards)
                card.Votes = card.Votes.Where(v => v.UserId == CurrentUserId).ToList();
        }

        var moodCheckins = await db.MoodCheckins.AsNoTracking()
            .Where(m => m.RetroSessionId == session.Id)
            .ToListAsync();

        var actionItems = await db.ActionItems.AsNoTracking()
            .Where(a => a.RetroSessionId == session.Id)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();

        return Ok(new
        {
            Session      = session,
            Cards        = visibleCards,
            HiddenCounts = hiddenCounts,
            MoodCheckins = moodCheckins,
            ActionItems  = actionItems,
            // Quick retros have no team; the roster comes entirely from
            // retro_participants.
            Participants = await participants.GetParticipantsAsync(session.Id),
            FinishedVotingUserIds = finishedVotingUserIds,
        });
    }

    // POST api/quickretro/{id}/advance
    [HttpPost("api/quickretro/{id:guid}/advance")]
    public async Task<IActionResult> AdvancePhase(Guid id)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();
        if (session.Phase == RetroPhase.Completed) return BadRequest("Retro is already completed.");

        var next = NextPhase(session);

        if (session.Phase == RetroPhase.CheckIn && next == RetroPhase.Icebreaker)
        {
            // The order is drawn up front but nobody is spotlighted yet: the
            // facilitator starts the round explicitly (EE-163).
            var order = await participants.BuildSpeakerOrderAsync(session, null);
            session.SpeakerOrderJson = JsonConvert.SerializeObject(order);
            session.CurrentSpeakerId = null;
            session.IcebreakerQuestion = (await PickIcebreakerAsync())?.Text ?? session.IcebreakerQuestion;
        }
        else if (session.Phase == RetroPhase.Write && next == RetroPhase.Group)
        {
            // Bulk update instead of a fetch-then-per-row-upsert — one statement,
            // and nothing reads the cards again in this action (architecture doc §3.8).
            await db.RetroCards
                .Where(c => c.RetroSessionId == session.Id)
                .ExecuteUpdateAsync(c => c.SetProperty(x => x.IsRevealed, true));
        }

        session.Phase = next;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // POST api/quickretro/{id}/cards
    [HttpPost("api/quickretro/{id:guid}/cards")]
    public async Task<IActionResult> AddCard(Guid id, [FromBody] QuickAddCardRequest req)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Write) return BadRequest("Cards can only be added during the Write phase.");

        var content = req.Content?.Trim();
        if (string.IsNullOrEmpty(content)) return BadRequest("Content is required.");
        if (content.Length > MaxCardLength)
            return BadRequest($"A card must be {MaxCardLength} characters or fewer.");

        // Reject columns that are not part of this retro, otherwise the card is
        // persisted but never rendered by the board.
        var column = req.Column?.Trim();
        if (string.IsNullOrEmpty(column) || !ReadColumns(session).Contains(column))
            return BadRequest("Unknown column for this retro.");

        var card = new RetroCard
        {
            RetroSessionId = session.Id,
            AuthorId = CurrentUserId,
            Column = column,
            Content = content,
        };

        db.RetroCards.Add(card);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        card.Votes = new();
        return Ok(card);
    }

    // PATCH api/quickretro/{id}/cards/{cardId}
    [HttpPatch("api/quickretro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> UpdateCard(Guid id, Guid cardId, [FromBody] QuickUpdateCardRequest req)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();

        var card = await db.RetroCards.FirstOrDefaultAsync(c => c.Id == cardId && c.RetroSessionId == id);
        if (card is null) return NotFound();

        if (req.Content is not null)
        {
            if (card.AuthorId != CurrentUserId || session.Phase != RetroPhase.Write)
                return Forbid();
            var content = req.Content.Trim();
            if (content.Length == 0) return BadRequest("Content is required.");
            if (content.Length > MaxCardLength)
                return BadRequest($"A card must be {MaxCardLength} characters or fewer.");
            card.Content = content;
        }

        if (req.GroupId is not null || req.GroupLabel is not null)
        {
            if (session.Phase != RetroPhase.Group)
                return BadRequest("Grouping is only allowed during the Group phase.");
            // Grouping is a facilitation control, not a participant action.
            if (session.FacilitatorId != CurrentUserId) return Forbid();

            if (req.GroupId is Guid groupId)
            {
                // The group id is another card's id, and the client renders a
                // group per distinct value — one pointing outside this retro
                // would silently split the board.
                if (groupId == Guid.Empty)
                {
                    card.GroupId = null;
                }
                else
                {
                    if (!(await GetCardIdsAsync(session.Id)).Contains(groupId))
                        return BadRequest("Group id must be a card of this retro.");
                    card.GroupId = groupId;
                }
            }

            if (req.GroupLabel is not null)
            {
                var label = req.GroupLabel.Trim();
                if (label.Length > MaxGroupLabelLength)
                    return BadRequest($"A group name must be {MaxGroupLabelLength} characters or fewer.");
                card.GroupLabel = label.Length == 0 ? null : label;
            }
        }

        if (req.DiscussionNotes is not null)
        {
            if (session.Phase != RetroPhase.Discuss)
                return BadRequest("Discussion notes can only be edited during the Discuss phase.");
            if (req.DiscussionNotes.Length > MaxNotesLength)
                return BadRequest($"Discussion notes must be {MaxNotesLength} characters or fewer.");
            card.DiscussionNotes = req.DiscussionNotes;
        }

        if (req.IsDiscussed.HasValue)
        {
            // Marking a card discussed is a facilitation control, not a
            // participant action.
            if (session.FacilitatorId != CurrentUserId) return Forbid();
            card.IsDiscussed = req.IsDiscussed.Value;
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(card);
    }

    // DELETE api/quickretro/{id}/cards/{cardId}
    [HttpDelete("api/quickretro/{id:guid}/cards/{cardId:guid}")]
    public async Task<IActionResult> DeleteCard(Guid id, Guid cardId)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();
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

    // PUT api/quickretro/{id}/votes
    [HttpPut("api/quickretro/{id:guid}/votes")]
    public async Task<IActionResult> UpsertVotes(Guid id, [FromBody] List<QuickVoteEntry>? req)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Vote)
            return BadRequest("Voting is only allowed during the Vote phase.");

        var entries = req ?? [];

        // Negative counts used to slip through: they shrank the total below the
        // budget while the positive entries — the only ones actually stored —
        // blew straight past it.
        if (entries.Any(v => v.Count < 0))
            return BadRequest("Vote counts cannot be negative.");

        var totalVotes = entries.Sum(v => v.Count);
        if (totalVotes > session.VoteCount)
            return BadRequest($"Vote budget exceeded. Maximum is {session.VoteCount} votes.");

        var cardIds = await GetCardIdsAsync(session.Id);

        var parsed = new List<(Guid CardId, int Count)>();
        foreach (var entry in entries)
        {
            if (!Guid.TryParse(entry.CardId, out var cardId) || !cardIds.Contains(cardId))
                return BadRequest("Vote cast on a card that is not part of this retro.");
            parsed.Add((cardId, entry.Count));
        }

        var votes = parsed
            .Where(v => v.Count > 0)
            .Select(v => new RetroVote
            {
                RetroCardId = v.CardId,
                UserId = CurrentUserId,
                Count = v.Count,
            }).ToList();

        if (cardIds.Count > 0)
        {
            // Delete-then-insert wrapped in one transaction — a failure between the two
            // used to lose the user's votes entirely (architecture doc §3.8).
            await using var tx = await db.Database.BeginTransactionAsync();

            await db.RetroVotes
                .Where(v => cardIds.Contains(v.RetroCardId) && v.UserId == CurrentUserId)
                .ExecuteDeleteAsync();

            if (votes.Count > 0)
            {
                db.RetroVotes.AddRange(votes);
                await db.SaveChangesAsync();
            }

            await tx.CommitAsync();
            live.Touch(Topics.Retro(session.Id));
        }

        return Ok(new { saved = votes.Count });
    }

    // POST api/quickretro/{id}/mood
    [HttpPost("api/quickretro/{id:guid}/mood")]
    public async Task<IActionResult> SubmitMood(Guid id, [FromBody] QuickMoodRequest req)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();

        // Out-of-range values used to reach the database and come back as a 500
        // from the mood_checkins check constraint.
        if (!IsValidMood(req.EntryMood) || !IsValidMood(req.ExitMood))
            return BadRequest($"Mood must be between {MinMood} and {MaxMood}.");
        if (req.EntryMood is null && req.ExitMood is null)
            return BadRequest("An entry or exit mood is required.");

        var existing = await db.MoodCheckins
            .FirstOrDefaultAsync(m => m.RetroSessionId == id && m.UserId == CurrentUserId);

        if (existing is null)
        {
            var checkin = new MoodCheckin
            {
                RetroSessionId = id,
                UserId = CurrentUserId,
                EntryMood = req.EntryMood,
                ExitMood = req.ExitMood,
            };
            db.MoodCheckins.Add(checkin);
            await db.SaveChangesAsync();
            live.Touch(Topics.Retro(id));
            return Ok(checkin);
        }

        if (req.EntryMood.HasValue) existing.EntryMood = req.EntryMood;
        if (req.ExitMood.HasValue) existing.ExitMood = req.ExitMood;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(id));
        return Ok(existing);
    }

    // POST api/quickretro/{id}/icebreaker/roll
    // With a `question` in the body the facilitator sets their own wording; the
    // custom text lives on the session only, it is not added to the icebreakers
    // library.
    [HttpPost("api/quickretro/{id:guid}/icebreaker/roll")]
    public async Task<IActionResult> RollIcebreaker(
        Guid id, [FromBody] RollIcebreakerRequest? req = null)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();

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

        var pick = await PickIcebreakerAsync(session.IcebreakerQuestion);
        if (pick is null) return BadRequest("No icebreakers available.");

        session.IcebreakerQuestion = pick.Text;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(new { question = pick.Text, category = pick.Category });
    }

    // POST api/quickretro/{id}/icebreaker/shuffle
    // Re-draws the speaking order from whoever has joined so far and rewinds the
    // round to "not started" (EE-163).
    [HttpPost("api/quickretro/{id:guid}/icebreaker/shuffle")]
    public async Task<IActionResult> ShuffleSpeakerOrder(Guid id)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Icebreaker)
            return BadRequest("The speaking order can only be shuffled during the Icebreaker phase.");

        var order = await participants.BuildSpeakerOrderAsync(session, null);
        session.SpeakerOrderJson = JsonConvert.SerializeObject(order);
        session.CurrentSpeakerId = null;

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // POST api/quickretro/{id}/icebreaker/start
    // Spotlights the first speaker, building the order on the fly when the retro
    // skipped the Check-In phase and never had one drawn (EE-163/EE-165).
    [HttpPost("api/quickretro/{id:guid}/icebreaker/start")]
    public async Task<IActionResult> StartIcebreaker(Guid id)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();
        if (session.Phase != RetroPhase.Icebreaker)
            return BadRequest("The icebreaker can only be started during the Icebreaker phase.");

        var order = ReadSpeakerOrder(session);
        if (order.Count == 0)
        {
            order = await participants.BuildSpeakerOrderAsync(session, null);
            session.SpeakerOrderJson = JsonConvert.SerializeObject(order);
        }
        if (order.Count == 0) return BadRequest("Nobody has joined this retro yet.");

        session.CurrentSpeakerId = Guid.Parse(order[0]);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // PATCH api/quickretro/{id}/speaker
    [HttpPatch("api/quickretro/{id:guid}/speaker")]
    public async Task<IActionResult> AdvanceSpeaker(Guid id, [FromBody] QuickAdvanceSpeakerRequest req)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();

        var order = ReadSpeakerOrder(session);

        if (req.SpeakerId.HasValue)
        {
            // Spotlighting someone who isn't in the retro leaves the panel
            // pointing at a name it can't resolve.
            var known = order.Contains(req.SpeakerId.Value.ToString())
                || await participants.IsParticipantAsync(session.Id, req.SpeakerId.Value);
            if (!known) return BadRequest("That person is not part of this retro.");

            session.CurrentSpeakerId = req.SpeakerId;
        }
        else
        {
            var current = session.CurrentSpeakerId?.ToString() ?? string.Empty;
            var idx = order.IndexOf(current);

            session.CurrentSpeakerId = idx >= 0 && idx < order.Count - 1
                ? Guid.Parse(order[idx + 1])
                : null;
        }

        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // PATCH api/quickretro/{id}/discuss
    [HttpPatch("api/quickretro/{id:guid}/discuss")]
    public async Task<IActionResult> SetActiveDiscussion(Guid id, [FromBody] QuickSetDiscussRequest req)
    {
        var session = await GetFacilitatedSession(id);
        if (session is null) return NotFound();

        if (req.CardId.HasValue && !(await GetCardIdsAsync(session.Id)).Contains(req.CardId.Value))
            return BadRequest("That card is not part of this retro.");

        session.ActiveDiscussionCardId = req.CardId;
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(session);
    }

    // POST api/quickretro/{id}/action-items
    [HttpPost("api/quickretro/{id:guid}/action-items")]
    public async Task<IActionResult> CreateActionItem(Guid id, [FromBody] QuickCreateActionItemRequest req)
    {
        var session = await GetAccessibleSession(id);
        if (session is null) return NotFound();

        var text = req.Text?.Trim();
        if (string.IsNullOrEmpty(text)) return BadRequest("Text is required.");
        if (text.Length > MaxActionItemLength)
            return BadRequest($"An action item must be {MaxActionItemLength} characters or fewer.");

        // Only accept a card that actually belongs to this session.
        Guid? retroCardId = null;
        if (req.RetroCardId.HasValue)
        {
            if (!(await GetCardIdsAsync(session.Id)).Contains(req.RetroCardId.Value))
                return BadRequest("Card does not belong to this retro session.");
            retroCardId = req.RetroCardId;
        }

        var item = new ActionItem
        {
            SprintId = null,
            RetroSessionId = session.Id,
            RetroCardId = retroCardId,
            Type = ActionItemType.Retro,
            Text = text,
            Status = ActionItemStatus.Open,
        };

        db.ActionItems.Add(item);
        await db.SaveChangesAsync();
        live.Touch(Topics.Retro(session.Id));
        return Ok(item);
    }
}

// The string members are nullable on purpose: JSON binding happily leaves a
// missing property null regardless of the declared reference type, so every
// endpoint has to check rather than trust the signature.
public record QuickCreateRetroRequest(
    string? Name,
    string? ColumnsJson,
    int? VoteCount,
    bool? HideVotesUntilRevealed,
    bool? SkipMoodCheckins,
    bool? SkipIcebreaker);

public record QuickAddCardRequest(string? Column, string? Content);

public class QuickUpdateCardRequest
{
    public string? Content { get; init; }
    public Guid? GroupId { get; init; }
    public string? GroupLabel { get; init; }
    public string? DiscussionNotes { get; init; }
    public bool? IsDiscussed { get; init; }
}

public record QuickVoteEntry(string? CardId, int Count);

public record QuickMoodRequest(int? EntryMood, int? ExitMood);

public record QuickAdvanceSpeakerRequest(Guid? SpeakerId);

public record QuickSetDiscussRequest(Guid? CardId);

public record QuickCreateActionItemRequest(string? Text, Guid? RetroCardId);
