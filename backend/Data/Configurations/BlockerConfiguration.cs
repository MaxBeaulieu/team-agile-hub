using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class BlockerConfiguration : IEntityTypeConfiguration<Blocker>
{
    public void Configure(EntityTypeBuilder<Blocker> builder)
    {
        // SprintId's FK is configured from the Sprint side (SprintConfiguration.Blockers).
        builder.ToTable("blockers", t => t.HasCheckConstraint(
            "blockers_status_check", "status in ('Open', 'InProgress', 'Resolved')"));
        builder.HasKey(b => b.Id);

        builder.HasOne<Team>().WithMany()
            .HasForeignKey(b => b.TeamId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(b => b.RaisedBy)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(b => b.OwnerId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
