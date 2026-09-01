using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class RetroSessionConfiguration : IEntityTypeConfiguration<RetroSession>
{
    public void Configure(EntityTypeBuilder<RetroSession> builder)
    {
        // phase never had a CHECK constraint in the original schema (010's comment notes
        // it was left PascalCase and untouched) — added here anyway as a new safety net
        // per architect review: without it, a wrong RetroPhase EnumMemberConverter value
        // fails silently instead of loudly, exactly the trap §3.3 warns about.
        builder.ToTable("retro_sessions", t => t.HasCheckConstraint(
            "retro_sessions_phase_check",
            "phase in ('CheckIn', 'Icebreaker', 'Write', 'Group', 'Vote', 'Discuss', 'WrapUp', 'Completed')"));
        builder.HasKey(s => s.Id);

        // [MaxLength] on the model is documentation only, not a real DB constraint —
        // see IcebreakerConfiguration's comment for the full rationale. 011/001 declare
        // these plain `text`.
        builder.Property(s => s.Name).HasColumnType("text");
        builder.Property(s => s.IcebreakerQuestion).HasColumnType("text");

        builder.HasIndex(s => s.InviteCode).IsUnique();

        // Nullable since migration 011 (QuickRetro), but the FK's `on delete cascade`
        // was never changed — preserved as Cascade even though optional.
        builder.HasOne<Sprint>().WithMany()
            .HasForeignKey(s => s.SprintId)
            .OnDelete(DeleteBehavior.Cascade);

        // 011 dropped the plain unique constraint on SprintId (to allow sprint-less
        // quick retros) but never replaced it with anything, leaving a real race:
        // CreateRetro (:116-120) does check-then-insert with no transaction, so two
        // concurrent calls for the same sprint can each pass the check and both insert,
        // silently orphaning one (GetSprintAndSession's .FirstOrDefault() picks one and
        // the other is never reachable again). This partial unique index restores the
        // invariant CreateRetro already assumes holds, without blocking sprint-less
        // (quick) retros. Added per architect review — a fresh database with no data is
        // the only cheap moment to add it. Also load-bearing for realtime: §2.1 keys the
        // poker topic as `poker:{sprintId}` because poker_sessions.sprint_id is unique;
        // if this index is ever "tidied away," the same ambiguity risk applies here.
        // Phase 3 TODO: CreateRetro should catch 23505 and re-read on conflict, the same
        // pattern RetroParticipantService.EnsureParticipantAsync already uses.
        builder.HasIndex(s => s.SprintId)
            .IsUnique()
            .HasFilter("sprint_id is not null")
            .HasDatabaseName("retro_sessions_sprint_id_key");

        builder.HasOne<User>().WithMany()
            .HasForeignKey(s => s.FacilitatorId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(s => s.Cards).WithOne()
            .HasForeignKey(c => c.RetroSessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.MoodCheckins).WithOne()
            .HasForeignKey(m => m.RetroSessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.Participants).WithOne()
            .HasForeignKey(p => p.RetroSessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class RetroCardConfiguration : IEntityTypeConfiguration<RetroCard>
{
    public void Configure(EntityTypeBuilder<RetroCard> builder)
    {
        builder.ToTable("retro_cards");
        builder.HasKey(c => c.Id);

        // "column" is a SQL reserved word — explicit despite the snake_case convention
        // already producing it, per architecture doc §3.2.
        builder.Property(c => c.Column).HasColumnName("column").HasColumnType("text");

        // [MaxLength] on the model is documentation only, not a real DB constraint —
        // see IcebreakerConfiguration's comment. 001 declares these plain `text`.
        builder.Property(c => c.Content).HasColumnType("text");
        builder.Property(c => c.GroupLabel).HasColumnType("text");

        builder.HasOne<User>().WithMany()
            .HasForeignKey(c => c.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(c => c.Votes).WithOne()
            .HasForeignKey(v => v.RetroCardId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class RetroVoteConfiguration : IEntityTypeConfiguration<RetroVote>
{
    public void Configure(EntityTypeBuilder<RetroVote> builder)
    {
        builder.ToTable("retro_votes");
        builder.HasKey(v => v.Id);

        builder.HasIndex(v => new { v.RetroCardId, v.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(v => v.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class MoodCheckinConfiguration : IEntityTypeConfiguration<MoodCheckin>
{
    public void Configure(EntityTypeBuilder<MoodCheckin> builder)
    {
        // RetroController.SubmitMood writes req.EntryMood straight through with no
        // range validation (unlike QuickRetroController's equivalent, which does) —
        // dropping this CHECK would let an out-of-range mood reach HealthController's
        // team-mood average silently. Restored per architect review.
        builder.ToTable("mood_checkins", t =>
        {
            t.HasCheckConstraint("mood_checkins_entry_mood_check", "entry_mood between 1 and 5");
            t.HasCheckConstraint("mood_checkins_exit_mood_check", "exit_mood between 1 and 5");
        });
        builder.HasKey(m => m.Id);

        builder.HasIndex(m => new { m.RetroSessionId, m.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class RetroParticipantConfiguration : IEntityTypeConfiguration<RetroParticipant>
{
    public void Configure(EntityTypeBuilder<RetroParticipant> builder)
    {
        builder.ToTable("retro_participants");
        builder.HasKey(p => p.Id);

        builder.HasIndex(p => new { p.RetroSessionId, p.UserId }).IsUnique();

        builder.HasOne<User>().WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class RetroTemplateConfiguration : IEntityTypeConfiguration<RetroTemplate>
{
    public void Configure(EntityTypeBuilder<RetroTemplate> builder)
    {
        builder.ToTable("retro_templates");
        builder.HasKey(t => t.Id);

        // [MaxLength] on the model is documentation only, not a real DB constraint —
        // see IcebreakerConfiguration's comment. 015 declares this plain `text`.
        builder.Property(t => t.Name).HasColumnType("text");

        builder.HasOne<User>().WithMany()
            .HasForeignKey(t => t.CreatedBy)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
