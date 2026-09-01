using Newtonsoft.Json;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class RetroCard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RetroSessionId { get; set; }

    public Guid AuthorId { get; set; }

    // "column" is a SQL reserved word — HasColumnName("column") set explicitly in
    // AppDbContext configuration (architecture doc §3.2).
    [Required, MaxLength(50)]
    public string Column { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Content { get; set; } = string.Empty;

    /// <summary>Cards in the same group share a GroupId</summary>
    public Guid? GroupId { get; set; }

    [MaxLength(100)]
    public string? GroupLabel { get; set; }

    /// <summary>Live collaborative notes during Discuss phase</summary>
    public string? DiscussionNotes { get; set; }

    public bool IsRevealed { get; set; } = false;

    public bool IsDiscussed { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonProperty("retro_votes")]
    public List<RetroVote> Votes { get; set; } = new();
}

public class RetroVote
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RetroCardId { get; set; }

    public Guid UserId { get; set; }

    /// <summary>Number of votes stacked on this card by this user</summary>
    public int Count { get; set; } = 1;
}
