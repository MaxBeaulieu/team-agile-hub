using Postgrest.Attributes;
using Postgrest.Models;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

[Table("icebreakers")]
public class Icebreaker : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("text")]
    [Required, MaxLength(500)]
    public string Text { get; set; } = string.Empty;

    [Column("category")]
    [MaxLength(50)]
    public string Category { get; set; } = "general";

    /// <summary>seeded or custom</summary>
    [Column("source")]
    [MaxLength(10)]
    public string Source { get; set; } = "seeded";
}
