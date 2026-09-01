using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class JiraIntegrationConfiguration : IEntityTypeConfiguration<JiraIntegration>
{
    public void Configure(EntityTypeBuilder<JiraIntegration> builder)
    {
        builder.ToTable("jira_integrations");
        builder.HasKey(j => j.Id);

        builder.HasIndex(j => j.TeamId).IsUnique();

        builder.HasOne<Team>().WithMany()
            .HasForeignKey(j => j.TeamId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
