using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users", t => t.HasCheckConstraint(
            "users_guest_has_no_entra_id",
            "not is_anonymous or entra_object_id is null"));

        builder.HasKey(u => u.Id);

        // Id generation convention (app-generated GUID, DB default as a defense-in-depth
        // fallback) is applied globally in AppDbContext.ApplyIdGenerationConventions —
        // not repeated per entity.

        // Identity key for staff (Entra `oid`). Null for guests. Unique only among
        // non-null values — Postgres already treats NULL as distinct in a plain unique
        // index, but the explicit filter documents the intent and matches
        // docs/architecture/selfhost-migration.md §1.2 exactly.
        builder.HasIndex(u => u.EntraObjectId)
            .IsUnique()
            .HasFilter("entra_object_id is not null")
            .HasDatabaseName("users_entra_object_id_key");

        // Deliberately NOT unique — see architecture doc §1.2. Indexed on lower(email)
        // for the one lookup that exists (platform-admin-allowlist matching); added via
        // raw SQL in the migration since EF Core has no fluent API for expression
        // indexes on a plain (non-computed) column.
    }
}
