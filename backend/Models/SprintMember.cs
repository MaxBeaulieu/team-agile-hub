namespace Backend.Models;

public class SprintMember
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SprintId { get; set; }

    public Guid UserId { get; set; }

    public string? DaysOff { get; set; }

    public int? CapacityScore { get; set; }
}

public class SprintTraining
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SprintId { get; set; }

    public Guid UserId { get; set; }

    public string Description { get; set; } = string.Empty;
}
