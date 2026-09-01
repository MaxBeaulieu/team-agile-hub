using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class PlatformAdminConfiguration : IEntityTypeConfiguration<PlatformAdmin>
{
    public void Configure(EntityTypeBuilder<PlatformAdmin> builder)
    {
        builder.ToTable("platform_admins");

        // UserId is the primary key itself, not a separate Id — matches
        // supabase/migrations/019_roles_and_platform_admins.sql:37-41
        // (`user_id uuid primary key references auth.users(id) on delete cascade`).
        builder.HasKey(p => p.UserId);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Deliberately chosen (original SQL had no "on delete" clause, defaulting to
        // NO ACTION) — architecture doc §3.1 SetNull list.
        builder.HasOne<User>().WithMany()
            .HasForeignKey(p => p.GrantedBy)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public class PlatformAdminAllowlistConfiguration : IEntityTypeConfiguration<PlatformAdminAllowlist>
{
    public void Configure(EntityTypeBuilder<PlatformAdminAllowlist> builder)
    {
        builder.ToTable("platform_admin_allowlist", t => t.HasCheckConstraint(
            "platform_admin_allowlist_email_lowercase",
            "email = lower(email)"));

        builder.HasKey(a => a.Email);

        // Same bootstrap row as supabase/migrations/019_roles_and_platform_admins.sql:44-46.
        builder.HasData(new PlatformAdminAllowlist
        {
            Email = "maxime.beaulieu@amilia.com",
            Note = "bootstrap admin — migration 019",
            AddedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });
    }
}
