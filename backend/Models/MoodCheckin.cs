using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

[Table("mood_checkins")]
public class MoodCheckin : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("retro_session_id")]
    public Guid RetroSessionId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    /// <summary>1–5 mood at the start of the retro</summary>
    [Column("entry_mood")]
    public int? EntryMood { get; set; }

    /// <summary>1–5 mood at the end of the retro (WrapUp phase)</summary>
    [Column("exit_mood")]
    public int? ExitMood { get; set; }
}
