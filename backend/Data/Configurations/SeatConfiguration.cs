using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class SeatConfiguration : IEntityTypeConfiguration<Seat>
{
    public void Configure(EntityTypeBuilder<Seat> builder)
    {
        // An occupied seat always carries an assignment type, a free one never does —
        // supabase/migrations/007_seats.sql:23-26. Pod/facing/assignment CHECKs restore
        // the original 007 constraints; assignment's CHECK is automatically satisfied by
        // NULL (a free seat), so it doesn't conflict with the consistency check above.
        builder.ToTable("seats", t =>
        {
            t.HasCheckConstraint(
                "seats_assignment_consistency",
                "(occupant_id is null and assignment is null) or (occupant_id is not null and assignment is not null)");
            t.HasCheckConstraint(
                "seats_pod_check", "pod in ('HEX', 'A', 'B', 'C', 'D', 'E', 'F')");
            t.HasCheckConstraint(
                "seats_facing_check", "facing in ('N', 'E', 'S', 'W')");
            t.HasCheckConstraint(
                "seats_assignment_check", "assignment in ('permanent', 'floating')");
        });

        builder.HasKey(s => s.Id);

        builder.HasIndex(s => s.SeatNumber).IsUnique();
        builder.HasIndex(s => s.OccupantId).HasDatabaseName("seats_occupant_idx");

        builder.HasOne<User>().WithMany()
            .HasForeignKey(s => s.OccupantId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
