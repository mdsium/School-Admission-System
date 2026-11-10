using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Admission.Api;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<Hold> Holds => Set<Hold>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(40);
            e.Property(x => x.Username).HasMaxLength(100).IsRequired();
            e.Property(x => x.Email).HasMaxLength(150).IsRequired();
            e.Property(x => x.FullName).HasMaxLength(150).IsRequired();
            e.Property(x => x.PhoneNumber).HasMaxLength(30);
            e.Property(x => x.PasswordHash).IsRequired();
            e.Property(x => x.Role).HasMaxLength(20).IsRequired();

            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.Email).IsUnique();
        });

        b.Entity<SchoolClass>(e =>
        {
            e.ToTable("classes", t => t.HasCheckConstraint("ck_classes_total_seats", "\"TotalSeats\" > 0"));
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Shift).HasMaxLength(50).IsRequired();
        });

        b.Entity<Hold>(e =>
        {
            e.ToTable("holds");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(40);
            e.Property(x => x.ClassId).HasMaxLength(40).IsRequired();
            e.Property(x => x.StudentId).HasMaxLength(17).IsRequired();
            e.Property(x => x.UserId).HasMaxLength(40);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(12);

            e.HasOne(x => x.Class).WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

            // Seat-count queries: (class, status, expiry)
            e.HasIndex(x => new { x.ClassId, x.Status, x.ExpiresAt });
            e.HasIndex(x => x.StudentId);
            e.HasIndex(x => x.UserId);

            // DB-level safety net: a student can have at most ONE live (HELD or CONFIRMED)
            // row per class, even if application logic has a bug.
            e.HasIndex(x => new { x.ClassId, x.StudentId })
                .IsUnique()
                .HasFilter("\"Status\" IN ('HELD','CONFIRMED')")
                .HasDatabaseName("ux_holds_one_live_per_student_class");
        });
    }

    public async Task SeedAsync()
    {
        // Seed default admin if none exists
        if (!await Users.AnyAsync(u => u.Role == Roles.Admin))
        {
            var hasher = new PasswordHasher<User>();
            var admin = new User
            {
                Id = "u_admin_" + Guid.NewGuid().ToString("N")[..8],
                Username = "admin",
                Email = "admin@school.com",
                FullName = "System Administrator",
                PhoneNumber = "01700000000",
                Role = Roles.Admin,
                MustChangePassword = true,
                CreatedAt = DateTime.UtcNow
            };
            admin.PasswordHash = hasher.HashPassword(admin, "1234");
            Users.Add(admin);
            await SaveChangesAsync();
        }

        // Seed sample classes if none exist
        if (!await Classes.AnyAsync())
        {
            Classes.AddRange(
                new SchoolClass { Id = "c_cls6_morn", Name = "Class 6", Shift = "Morning Shift", TotalSeats = 120, CreatedAt = DateTime.UtcNow },
                new SchoolClass { Id = "c_cls6_day", Name = "Class 6", Shift = "Day Shift", TotalSeats = 80, CreatedAt = DateTime.UtcNow },
                new SchoolClass { Id = "c_cls7_morn", Name = "Class 7", Shift = "Morning Shift", TotalSeats = 100, CreatedAt = DateTime.UtcNow },
                new SchoolClass { Id = "c_cls8_morn", Name = "Class 8", Shift = "Morning Shift", TotalSeats = 60, CreatedAt = DateTime.UtcNow }
            );
            await SaveChangesAsync();
        }
    }
}
