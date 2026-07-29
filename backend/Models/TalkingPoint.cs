using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

[Table("talking_points")]
public class TalkingPoint : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("focus_topic_id")]
    public Guid? FocusTopicId { get; set; }

    [Column("agenda_item_id")]
    public Guid? AgendaItemId { get; set; }

    [Column("text")]
    public string Text { get; set; } = string.Empty;

    [Column("order")]
    public int Order { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Reference(typeof(TalkingPointNote), includeInQuery: false, columnName: "talking_point_notes")]
    [JsonProperty("talking_point_notes")]
    public List<TalkingPointNote> Notes { get; set; } = new();

    [Reference(typeof(ActionItem), includeInQuery: false, columnName: "action_items")]
    [JsonProperty("action_items")]
    public List<ActionItem> ActionItems { get; set; } = new();
}

[Table("talking_point_notes")]
public class TalkingPointNote : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("talking_point_id")]
    public Guid TalkingPointId { get; set; }

    [Column("author_id")]
    public Guid AuthorId { get; set; }

    [Column("content")]
    public string Content { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
