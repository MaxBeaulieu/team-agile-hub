using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class ActionItemConfiguration : IEntityTypeConfiguration<ActionItem>
{
    public void Configure(EntityTypeBuilder<ActionItem> builder)
    {
        // SprintId's FK is configured from the Sprint side (SprintConfiguration.ActionItems)
        // and TalkingPointId's FK from the TalkingPoint side (TalkingPointConfiguration.ActionItems)
        // — not repeated here.
        builder.ToTable("action_items", t =>
        {
            t.HasCheckConstraint(
                "action_items_scope_check",
                "sprint_id is not null or retro_session_id is not null");
            t.HasCheckConstraint(
                "action_items_type_check", "type in ('retro', 'planning')");
            t.HasCheckConstraint(
                "action_items_status_check",
                "status in ('open', 'in_progress', 'done', 'carried_over', 'dropped')");
        });

        builder.HasKey(a => a.Id);

        // action_items.due_date is SQL type `date` (001), and ActionItem.DueDate is now
        // DateOnly? — Npgsql maps DateOnly <-> date natively, so no explicit
        // HasColumnType is needed (architecture doc §3.5). Flipped from DateTime? in
        // this same commit as its one call site, RetroController.CreateActionItem.

        builder.HasOne<User>().WithMany()
            .HasForeignKey(a => a.AssigneeId)
            .OnDelete(DeleteBehavior.SetNull);

        // No "on delete" clause in 001_initial_schema.sql -> Postgres default NO ACTION.
        builder.HasOne<ActionItem>().WithMany()
            .HasForeignKey(a => a.CarriedFromId)
            .OnDelete(DeleteBehavior.Restrict);

        // Added by migration 013; no nav on RetroCard (it never had one).
        builder.HasOne<RetroCard>().WithMany()
            .HasForeignKey(a => a.RetroCardId)
            .OnDelete(DeleteBehavior.Cascade);

        // Added by migration 014; no nav on RetroSession.
        builder.HasOne<RetroSession>().WithMany()
            .HasForeignKey(a => a.RetroSessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
