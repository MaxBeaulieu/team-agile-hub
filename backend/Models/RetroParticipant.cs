namespace Backend.Models;

/// <summary>
/// Session-level membership for a retro: who has joined (including anonymous
/// invite-link guests), their display name, and whether they're the host.
/// </summary>
public class RetroParticipant
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RetroSessionId { get; set; }

    public Guid UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public bool IsAnonymous { get; set; } = false;

    public bool IsHost { get; set; } = false;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
