using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

[Table("jira_integrations")]
public class JiraIntegration : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("team_id")]
    public Guid TeamId { get; set; }

    [Column("cloud_id")]
    public string CloudId { get; set; } = string.Empty;

    [Column("cloud_name")]
    public string CloudName { get; set; } = string.Empty;

    [Column("access_token_encrypted")]
    public string AccessTokenEncrypted { get; set; } = string.Empty;

    [Column("refresh_token_encrypted")]
    public string RefreshTokenEncrypted { get; set; } = string.Empty;

    [Column("token_expires_at")]
    public DateTime TokenExpiresAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
