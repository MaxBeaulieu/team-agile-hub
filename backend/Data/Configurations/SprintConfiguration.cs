using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class SprintConfiguration : IEntityTypeConfiguration<Sprint>
{
    public void Configure(EntityTypeBuilder<Sprint> builder)
    {
        builder.ToTable("sprints", t => t.HasCheckConstraint(
            "sprints_status_check", "status in ('planning', 'active', 'completed')"));
        builder.HasKey(s => s.Id);

        builder.HasOne<Team>().WithMany()
            .HasForeignKey(s => s.TeamId)
            .OnDelete(DeleteBehavior.Cascade);

        // Optional pointer, no independent meaning if the user disappears (§3.1).
        builder.HasOne<User>().WithMany()
            .HasForeignKey(s => s.ChampionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(s => s.SprintMembers).WithOne()
            .HasForeignKey(m => m.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.Trainings).WithOne()
            .HasForeignKey(t => t.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.FocusTopics).WithOne()
            .HasForeignKey(f => f.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        // sprint_id became nullable on ActionItem (migration 014) but the FK itself was
        // never changed off `on delete cascade` — preserved as-is.
        builder.HasMany(s => s.ActionItems).WithOne()
            .HasForeignKey(a => a.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        // blockers.sprint_id has no "on delete" clause in 001_initial_schema.sql, so
        // Postgres defaulted to NO ACTION — preserved as Restrict (distinct from
        // blockers.team_id below, which is Cascade).
        builder.HasMany(s => s.Blockers).WithOne()
            .HasForeignKey(b => b.SprintId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class SprintMemberConfiguration : IEntityTypeConfiguration<SprintMember>
{
    public void Configure(EntityTypeBuilder<SprintMember> builder)
    {
        builder.ToTable("sprint_members", t => t.HasCheckConstraint(
            "sprint_members_capacity_score_check", "capacity_score between 1 and 10"));
        builder.HasKey(m => m.Id);

        builder.HasIndex(m => new { m.SprintId, m.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class SprintTrainingConfiguration : IEntityTypeConfiguration<SprintTraining>
{
    public void Configure(EntityTypeBuilder<SprintTraining> builder)
    {
        builder.ToTable("sprint_trainings");
        builder.HasKey(t => t.Id);

        builder.HasIndex(t => new { t.SprintId, t.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
