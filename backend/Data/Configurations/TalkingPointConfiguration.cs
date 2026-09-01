using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class TalkingPointConfiguration : IEntityTypeConfiguration<TalkingPoint>
{
    public void Configure(EntityTypeBuilder<TalkingPoint> builder)
    {
        // FocusTopicId / AgendaItemId FKs are configured from their respective parent
        // sides (FocusTopicConfiguration / RecurringAgendaItemConfiguration).
        builder.ToTable("talking_points", t => t.HasCheckConstraint(
            "talking_point_has_one_parent",
            "(focus_topic_id is not null)::int + (agenda_item_id is not null)::int = 1"));

        builder.HasKey(tp => tp.Id);

        // SQL reserved word — see RetroCard.Column for the same treatment.
        builder.Property(tp => tp.Order).HasColumnName("order");

        builder.HasMany(tp => tp.Notes).WithOne()
            .HasForeignKey(n => n.TalkingPointId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(tp => tp.ActionItems).WithOne()
            .HasForeignKey(a => a.TalkingPointId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public class TalkingPointNoteConfiguration : IEntityTypeConfiguration<TalkingPointNote>
{
    public void Configure(EntityTypeBuilder<TalkingPointNote> builder)
    {
        builder.ToTable("talking_point_notes");
        builder.HasKey(n => n.Id);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(n => n.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
