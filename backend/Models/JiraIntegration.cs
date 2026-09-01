namespace Backend.Models;

public class JiraIntegration
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TeamId { get; set; }

    public string CloudId { get; set; } = string.Empty;

    public string CloudName { get; set; } = string.Empty;

    public string AccessTokenEncrypted { get; set; } = string.Empty;

    public string RefreshTokenEncrypted { get; set; } = string.Empty;

    public DateTime TokenExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
