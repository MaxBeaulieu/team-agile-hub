namespace Backend.Models;

public class MoodCheckin
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RetroSessionId { get; set; }

    public Guid UserId { get; set; }

    /// <summary>1–5 mood at the start of the retro</summary>
    public int? EntryMood { get; set; }

    /// <summary>1–5 mood at the end of the retro (WrapUp phase)</summary>
    public int? ExitMood { get; set; }
}
