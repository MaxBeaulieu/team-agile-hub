using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

[Table("retro_cards")]
public class RetroCard : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("retro_session_id")]
    public Guid RetroSessionId { get; set; }

    [Column("author_id")]
    public Guid AuthorId { get; set; }

    [Column("column")]
    [Required, MaxLength(50)]
    public string Column { get; set; } = string.Empty;

    [Column("content")]
    [Required, MaxLength(1000)]
    public string Content { get; set; } = string.Empty;

    /// <summary>Cards in the same group share a GroupId</summary>
    [Column("group_id")]
    public Guid? GroupId { get; set; }

    [Column("group_label")]
    [MaxLength(100)]
    public string? GroupLabel { get; set; }

    /// <summary>Live collaborative notes during Discuss phase</summary>
    [Column("discussion_notes")]
    public string? DiscussionNotes { get; set; }

    [Column("is_revealed")]
    public bool IsRevealed { get; set; } = false;

    [Column("is_discussed")]
    public bool IsDiscussed { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Reference(typeof(RetroVote), includeInQuery: false, columnName: "retro_votes")]
    [JsonProperty("retro_votes")]
    public List<RetroVote> Votes { get; set; } = new();
}

[Table("retro_votes")]
public class RetroVote : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("retro_card_id")]
    public Guid RetroCardId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    /// <summary>Number of votes stacked on this card by this user</summary>
    [Column("count")]
    public int Count { get; set; } = 1;
}
