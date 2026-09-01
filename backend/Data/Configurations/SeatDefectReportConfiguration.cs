using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Data.Configurations;

public class SeatDefectReportConfiguration : IEntityTypeConfiguration<SeatDefectReport>
{
    public void Configure(EntityTypeBuilder<SeatDefectReport> builder)
    {
        builder.ToTable("seat_defect_reports", t => t.HasCheckConstraint(
            "seat_defect_reports_status_check", "status in ('open', 'closed')"));
        builder.HasKey(r => r.Id);

        builder.HasIndex(r => r.Status).HasDatabaseName("seat_defect_reports_status_idx");
        builder.HasIndex(r => r.SeatId).HasDatabaseName("seat_defect_reports_seat_idx");

        builder.HasOne<Seat>().WithMany()
            .HasForeignKey(r => r.SeatId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(r => r.ReportedBy)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<User>().WithMany()
            .HasForeignKey(r => r.ClosedBy)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
