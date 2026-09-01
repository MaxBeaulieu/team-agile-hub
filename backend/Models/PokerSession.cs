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

public class PokerSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SprintId { get; set; }

    public PokerDeckType DeckType { get; set; } = PokerDeckType.Fibonacci;

    public string? CustomDeckJson { get; set; }

    public Guid? FacilitatorId { get; set; }

    public PokerSessionStatus Status { get; set; } = PokerSessionStatus.Pending;

    public Guid? CurrentTicketId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // No [JsonProperty] override — unlike the other collection navigations, this one
    // was never tagged and already serialises as camelCase "tickets" (confirmed against
    // frontend/src/app/dashboard/poker/ticket-sidebar.tsx). Do not add one.
    public List<PokerTicket> Tickets { get; set; } = [];
}

public class PokerTicket
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PokerSessionId { get; set; }

    public string? JiraIssueId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public int? FinalPoints { get; set; }

    public bool VotesRevealed { get; set; } = false;

    public int Order { get; set; }

    // No [JsonProperty] override — see the note on PokerSession.Tickets above; this
    // serialises as camelCase "votes" (confirmed against
    // frontend/src/app/dashboard/poker/voting-area.tsx).
    public List<PokerVote> Votes { get; set; } = [];
}

public class PokerVote
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PokerTicketId { get; set; }

    public Guid UserId { get; set; }

    public string Estimate { get; set; } = string.Empty;

    public DateTime? RevealedAt { get; set; }
}
