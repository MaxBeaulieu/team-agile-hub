using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class Icebreaker
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(500)]
    public string Text { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Category { get; set; } = "general";

    /// <summary>seeded or custom</summary>
    [MaxLength(10)]
    public string Source { get; set; } = "seeded";
}
