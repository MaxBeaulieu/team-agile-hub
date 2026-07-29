using Postgrest.Attributes;
using Postgrest.Models;

namespace Backend.Models;

[Table("sprint_members")]
public class SprintMember : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("days_off")]
    public string? DaysOff { get; set; }

    [Column("capacity_score")]
    public int? CapacityScore { get; set; }
}

[Table("sprint_trainings")]
public class SprintTraining : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("sprint_id")]
    public Guid SprintId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("description")]
    public string Description { get; set; } = string.Empty;
}
