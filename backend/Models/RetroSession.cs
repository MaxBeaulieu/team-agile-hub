using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System.ComponentModel.DataAnnotations;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum RetroPhase
{
    [EnumMember(Value = "CheckIn")]    CheckIn,
    [EnumMember(Value = "Icebreaker")] Icebreaker,
    [EnumMember(Value = "Write")]      Write,
    [EnumMember(Value = "Group")]      Group,
    [EnumMember(Value = "Vote")]       Vote,
    [EnumMember(Value = "Discuss")]    Discuss,
    [EnumMember(Value = "WrapUp")]     WrapUp,
    [EnumMember(Value = "Completed")]  Completed,
}

public class RetroSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(120)]
    public string Name { get; set; } = "Retro";

    // Nullable since migration 011 (QuickRetro / personal sessions) — a retro no
    // longer requires a sprint. No unique constraint on this column (that
    // constraint was dropped in the same migration); contrast with
    // PokerSession.SprintId, which is still 1:1 with its sprint.
    public Guid? SprintId { get; set; }

    public Guid? FacilitatorId { get; set; }

    public RetroPhase Phase { get; set; } = RetroPhase.CheckIn;

    /// <summary>JSON array of column names</summary>
    public string ColumnsJson { get; set; } = """["Went Well","Improve","Learnings","Questions"]""";

    /// <summary>Number of votes each participant gets</summary>
    public int VoteCount { get; set; } = 5;

    /// <summary>Hide votes until facilitator reveals</summary>
    public bool HideVotesUntilRevealed { get; set; } = false;

    /// <summary>Run this retro without the entry/exit mood check-in steps</summary>
    public bool SkipMoodCheckins { get; set; } = false;

    /// <summary>Run this retro without the icebreaker round</summary>
    public bool SkipIcebreaker { get; set; } = false;

    /// <summary>UserId of the person currently spotlighted in icebreaker</summary>
    public Guid? CurrentSpeakerId { get; set; }

    /// <summary>Ordered JSON array of UserIds for icebreaker round-robin</summary>
    public string? SpeakerOrderJson { get; set; }

    /// <summary>The icebreaker question text</summary>
    [MaxLength(500)]
    public string? IcebreakerQuestion { get; set; }

    /// <summary>Id of the retro card currently being discussed</summary>
    public Guid? ActiveDiscussionCardId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Short random code used to build the shareable invite link. Lazily generated.</summary>
    public string? InviteCode { get; set; }

    [JsonProperty("retro_cards")]
    public List<RetroCard> Cards { get; set; } = new();

    [JsonProperty("mood_checkins")]
    public List<MoodCheckin> MoodCheckins { get; set; } = new();

    [JsonProperty("retro_participants")]
    public List<RetroParticipant> Participants { get; set; } = new();
}
