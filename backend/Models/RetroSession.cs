using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Postgrest.Attributes;
using Postgrest.Models;
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

[Table("retro_sessions")]
public class RetroSession : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("facilitator_id")]
    public Guid? FacilitatorId { get; set; }

    [Column("phase")]
    public RetroPhase Phase { get; set; } = RetroPhase.CheckIn;

    /// <summary>JSON array of column names</summary>
    [Column("columns_json")]
    public string ColumnsJson { get; set; } = """["Went Well","Improve","Learnings","Questions"]""";

    /// <summary>Number of votes each participant gets</summary>
    [Column("vote_count")]
    public int VoteCount { get; set; } = 5;

    /// <summary>Hide votes until facilitator reveals</summary>
    [Column("hide_votes_until_revealed")]
    public bool HideVotesUntilRevealed { get; set; } = false;

    /// <summary>UserId of the person currently spotlighted in icebreaker</summary>
    [Column("current_speaker_id")]
    public Guid? CurrentSpeakerId { get; set; }

    /// <summary>Ordered JSON array of UserIds for icebreaker round-robin</summary>
    [Column("speaker_order_json")]
    public string? SpeakerOrderJson { get; set; }

    /// <summary>The icebreaker question text</summary>
    [Column("icebreaker_question")]
    [MaxLength(500)]
    public string? IcebreakerQuestion { get; set; }

    /// <summary>Id of the retro card currently being discussed</summary>
    [Column("active_discussion_card_id")]
    public Guid? ActiveDiscussionCardId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Short random code used to build the shareable invite link. Lazily generated.</summary>
    [Column("invite_code")]
    public string? InviteCode { get; set; }

    [Reference(typeof(RetroCard), includeInQuery: false, columnName: "retro_cards")]
    [JsonProperty("retro_cards")]
    public List<RetroCard> Cards { get; set; } = new();

    [Reference(typeof(MoodCheckin), includeInQuery: false, columnName: "mood_checkins")]
    [JsonProperty("mood_checkins")]
    public List<MoodCheckin> MoodCheckins { get; set; } = new();

    [Reference(typeof(RetroParticipant), includeInQuery: false, columnName: "retro_participants")]
    [JsonProperty("retro_participants")]
    public List<RetroParticipant> Participants { get; set; } = new();
}
