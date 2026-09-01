using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

/// <summary>
/// A named, reusable set of retro columns. Global — visible to every user.
/// Built-ins are seeded (originally migration 015, now via AppDbContext.HasData)
/// and cannot be edited or deleted.
/// </summary>
public class RetroTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    /// <summary>JSON array of column names</summary>
    public string ColumnsJson { get; set; } = "[]";

    /// <summary>Seeded template — read-only for everyone</summary>
    public bool IsBuiltin { get; set; } = false;

    /// <summary>Author of a user-created template. Null for built-ins.</summary>
    public Guid? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
