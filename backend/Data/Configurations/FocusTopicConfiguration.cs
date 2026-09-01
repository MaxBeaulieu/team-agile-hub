using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class FocusTopicConfiguration : IEntityTypeConfiguration<FocusTopic>
{
    public void Configure(EntityTypeBuilder<FocusTopic> builder)
    {
        // SprintId's FK is configured from the Sprint side (SprintConfiguration.FocusTopics).
        builder.ToTable("focus_topics", t => t.HasCheckConstraint(
            "focus_topics_status_check",
            "status in ('on_track', 'at_risk', 'on_hold', 'done')"));
        builder.HasKey(f => f.Id);

        // SQL reserved word — see RetroCard.Column for the same treatment.
        builder.Property(f => f.Order).HasColumnName("order");

        builder.HasMany(f => f.TalkingPoints).WithOne()
            .HasForeignKey(tp => tp.FocusTopicId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class RecurringAgendaItemConfiguration : IEntityTypeConfiguration<RecurringAgendaItem>
{
    public void Configure(EntityTypeBuilder<RecurringAgendaItem> builder)
    {
        builder.ToTable("recurring_agenda_items");
        builder.HasKey(r => r.Id);

        builder.HasOne<Team>().WithMany()
            .HasForeignKey(r => r.TeamId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(r => r.TalkingPoints).WithOne()
            .HasForeignKey(tp => tp.AgendaItemId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
