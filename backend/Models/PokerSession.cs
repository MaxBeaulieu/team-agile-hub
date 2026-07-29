using Postgrest.Attributes;
using Postgrest.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System.Runtime.Serialization;

namespace Backend.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum PokerDeckType
{
    [EnumMember(Value = "Fibonacci")] Fibonacci,
    [EnumMember(Value = "TShirt")]    TShirt,
    [EnumMember(Value = "Custom")]    Custom,
}

[JsonConverter(typeof(StringEnumConverter))]
public enum PokerSessionStatus
{
    [EnumMember(Value = "Pending")]    Pending,
    [EnumMember(Value = "InProgress")] InProgress,
    [EnumMember(Value = "Completed")]  Completed,
}

[Table("poker_sessions")]
public class PokerSession : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("deck_type")]
    public PokerDeckType DeckType { get; set; } = PokerDeckType.Fibonacci;

    [Column("custom_deck_json")]
    public string? CustomDeckJson { get; set; }

    [Column("facilitator_id")]
    public Guid? FacilitatorId { get; set; }

    [Column("status")]
    public PokerSessionStatus Status { get; set; } = PokerSessionStatus.Pending;

    [Column("current_ticket_id")]
    public Guid? CurrentTicketId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Reference(typeof(PokerTicket), useInnerJoin: false)]
    public List<PokerTicket> Tickets { get; set; } = [];
}

[Table("poker_tickets")]
public class PokerTicket : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("poker_session_id")]
    public Guid PokerSessionId { get; set; }

    [Column("jira_issue_id")]
    public string? JiraIssueId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("final_points")]
    public int? FinalPoints { get; set; }

    [Column("votes_revealed")]
    public bool VotesRevealed { get; set; } = false;

    [Column("order")]
    public int Order { get; set; }

    [Reference(typeof(PokerVote), useInnerJoin: false)]
    public List<PokerVote> Votes { get; set; } = [];
}

[Table("poker_votes")]
public class PokerVote : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("poker_ticket_id")]
    public Guid PokerTicketId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("estimate")]
    public string Estimate { get; set; } = string.Empty;

    [Column("revealed_at")]
    public DateTime? RevealedAt { get; set; }
}
