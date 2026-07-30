using Postgrest.Attributes;
using Postgrest.Models;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

/// <summary>
/// A named, reusable set of retro columns. Global — visible to every user.
/// Built-ins are seeded in migration 015 and cannot be edited or deleted.
/// </summary>
[Table("retro_templates")]
public class RetroTemplate : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("name")]
    [Required, MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    /// <summary>JSON array of column names</summary>
    [Column("columns_json")]
    public string ColumnsJson { get; set; } = "[]";

    /// <summary>Seeded template — read-only for everyone</summary>
    [Column("is_builtin")]
    public bool IsBuiltin { get; set; } = false;

    /// <summary>Author of a user-created template. Null for built-ins.</summary>
    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
