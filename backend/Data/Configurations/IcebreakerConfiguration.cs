using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class IcebreakerConfiguration : IEntityTypeConfiguration<Icebreaker>
{
    public void Configure(EntityTypeBuilder<Icebreaker> builder)
    {
        builder.ToTable("icebreakers");
        builder.HasKey(i => i.Id);

        // The model's [MaxLength] attributes are documentation only (see
        // QuickRetroController.cs:14-16) — 001_initial_schema.sql declares these plain
        // `text`, no length constraint. EF Core honours [MaxLength] by generating
        // `character varying(n)`, which Postgrest never did; pin back to `text` so the
        // migration doesn't introduce a new DB-level failure mode nothing validates for
        // today. See architecture doc §3.2 discussion / Phase 1 handoff notes.
        builder.Property(i => i.Text).HasColumnType("text");
        builder.Property(i => i.Category).HasColumnType("text");
        builder.Property(i => i.Source).HasColumnType("text");

        // Same 20 built-in icebreakers, same fixed ids, as
        // supabase/migrations/001_initial_schema.sql:206-227 — now diffable via HasData
        // instead of a frozen SQL blob (architecture doc §3.7).
        builder.HasData(IcebreakerSeeds.All);
    }
}
