using Newtonsoft.Json;

namespace Backend.Models;

public class Team
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public string SprintTerm { get; set; } = "Sprint";

    public Guid CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // No inverse navigation on TeamMember (architecture doc §3.4 rule 1).
    // JsonProperty maps the nested JSON key, matching the shape the frontend
    // has always parsed (originally produced by Postgrest's `.Select("*, team_members(*)")`).
    [JsonProperty("team_members")]
    public List<TeamMember> Members { get; set; } = new();
}
