using Newtonsoft.Json;
using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

[Table("teams")]
public class Team : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("sprint_term")]
    public string SprintTerm { get; set; } = "Sprint";

    [Column("created_by")]
    public Guid CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Reference — populated by .Select("*, team_members(*)") queries only.
    // JsonProperty maps the nested JSON key; Reference tells Postgrest not to
    // include this in INSERT/UPDATE payloads.
    [Reference(typeof(TeamMember), includeInQuery: false, columnName: "team_members")]
    [JsonProperty("team_members")]
    public List<TeamMember> Members { get; set; } = new();
}
