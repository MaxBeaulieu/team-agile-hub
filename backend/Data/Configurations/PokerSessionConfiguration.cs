using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class PokerSessionConfiguration : IEntityTypeConfiguration<PokerSession>
{
    public void Configure(EntityTypeBuilder<PokerSession> builder)
    {
        builder.ToTable("poker_sessions", t =>
        {
            t.HasCheckConstraint(
                "poker_sessions_deck_type_check",
                "deck_type in ('Fibonacci', 'TShirt', 'Custom')");
            t.HasCheckConstraint(
                "poker_sessions_status_check",
                "status in ('Pending', 'InProgress', 'Completed')");
        });
        builder.HasKey(s => s.Id);

        // Still unique/1:1 with its sprint — SprintId is required (unlike
        // RetroSession.SprintId, nullable since migration 011 for quick retros), so a
        // plain unique constraint is correct here. RetroSessionConfiguration adds an
        // equivalent *partial* unique index for the same invariant, restoring parity
        // that 011 quietly dropped — see the comment there.
        builder.HasIndex(s => s.SprintId).IsUnique();

        builder.HasOne<Sprint>().WithMany()
            .HasForeignKey(s => s.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(s => s.FacilitatorId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(s => s.Tickets).WithOne()
            .HasForeignKey(t => t.PokerSessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class PokerTicketConfiguration : IEntityTypeConfiguration<PokerTicket>
{
    public void Configure(EntityTypeBuilder<PokerTicket> builder)
    {
        builder.ToTable("poker_tickets");
        builder.HasKey(t => t.Id);

        // SQL reserved word — see RetroCard.Column for the same treatment.
        builder.Property(t => t.Order).HasColumnName("order");

        builder.HasMany(t => t.Votes).WithOne()
            .HasForeignKey(v => v.PokerTicketId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class PokerVoteConfiguration : IEntityTypeConfiguration<PokerVote>
{
    public void Configure(EntityTypeBuilder<PokerVote> builder)
    {
        builder.ToTable("poker_votes");
        builder.HasKey(v => v.Id);

        builder.HasIndex(v => new { v.PokerTicketId, v.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(v => v.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
