using Newtonsoft.Json;

namespace Backend.Models;

public class TalkingPoint
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? FocusTopicId { get; set; }

    public Guid? AgendaItemId { get; set; }

    public string Text { get; set; } = string.Empty;

    public int Order { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonProperty("talking_point_notes")]
    public List<TalkingPointNote> Notes { get; set; } = new();

    [JsonProperty("action_items")]
    public List<ActionItem> ActionItems { get; set; } = new();
}

public class TalkingPointNote
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TalkingPointId { get; set; }

    public Guid AuthorId { get; set; }

    public string Content { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
