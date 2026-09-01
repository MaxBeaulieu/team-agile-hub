using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class TeamConfiguration : IEntityTypeConfiguration<Team>
{
    public void Configure(EntityTypeBuilder<Team> builder)
    {
        // Simple length CHECKs from 001_initial_schema.sql — nothing in C# enforces
        // these today, so dropping them would be a silent behaviour change (architect
        // review, Phase 1 handoff). Restored even though the model has no [MaxLength]
        // for these two (unlike the columns pinned back to `text` elsewhere in this
        // file set — these were always meant to be enforced at the DB).
        builder.ToTable("teams", t =>
        {
            t.HasCheckConstraint("teams_name_length", "char_length(name) <= 100");
            t.HasCheckConstraint("teams_sprint_term_length", "char_length(sprint_term) <= 30");
        });
        builder.HasKey(t => t.Id);

        // architecture doc §3.1: authorship is history, blocks deletion loudly.
        builder.HasOne<User>().WithMany()
            .HasForeignKey(t => t.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // One-directional collection, no inverse nav on TeamMember (§3.4 rule 1).
        builder.HasMany(t => t.Members).WithOne()
            .HasForeignKey(m => m.TeamId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class TeamMemberConfiguration : IEntityTypeConfiguration<TeamMember>
{
    public void Configure(EntityTypeBuilder<TeamMember> builder)
    {
        // Enum CHECK constraint — architecture doc §3.3 flags 7 of 11 enums as failing
        // loudly with a wrong EnumMemberConverter and 4 failing silently; the CHECK is
        // what makes the loud ones loud. Restored for all 11 (Phase 1 handoff / architect
        // review), matching the wire values, not the C# member names.
        builder.ToTable("team_members", t => t.HasCheckConstraint(
            "team_members_role_check", "role in ('member', 'admin')"));
        builder.HasKey(m => m.Id);

        builder.HasIndex(m => new { m.TeamId, m.UserId }).IsUnique();

        // No nav on the Users side (§3.4 rule 2) — this FK is configured again here
        // (TeamId) only for the unique index above; the owning side of the relationship
        // itself is declared on TeamConfiguration.Members.
        builder.HasOne<User>().WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
