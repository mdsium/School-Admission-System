using Microsoft.EntityFrameworkCore;

namespace Admission.Api;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<Hold> Holds => Set<Hold>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<SchoolClass>(e =>
        {
            e.ToTable("classes", t => t.HasCheckConstraint("ck_classes_total_seats", "\"TotalSeats\" > 0"));
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
        });

        b.Entity<Hold>(e =>
        {
            e.ToTable("holds");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(40);
            e.Property(x => x.ClassId).HasMaxLength(40).IsRequired();
            e.Property(x => x.StudentId).HasMaxLength(17).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(12);

            e.HasOne(x => x.Class).WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Cascade);

            // Seat-count queries: (class, status, expiry)
            e.HasIndex(x => new { x.ClassId, x.Status, x.ExpiresAt });
            e.HasIndex(x => x.StudentId);

            // DB-level safety net: a student can have at most ONE live (HELD or CONFIRMED)
            // row per class, even if application logic has a bug.
            e.HasIndex(x => new { x.ClassId, x.StudentId })
                .IsUnique()
                .HasFilter("\"Status\" IN ('HELD','CONFIRMED')")
                .HasDatabaseName("ux_holds_one_live_per_student_class");
        });
    }
}
