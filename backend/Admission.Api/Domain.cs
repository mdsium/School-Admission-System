namespace Admission.Api;

public enum HoldStatus
{
    HELD,
    CONFIRMED,
    EXPIRED,
    CANCELLED
}

public static class Roles
{
    public const string Admin = "Admin";
    public const string Parent = "Parent";
}

public class User
{
    public string Id { get; set; } = default!;
    public string Username { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string FullName { get; set; } = default!;
    public string? PhoneNumber { get; set; }
    public string PasswordHash { get; set; } = default!;
    public string Role { get; set; } = Roles.Parent;
    public bool MustChangePassword { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class SchoolClass
{
    public string Id { get; set; } = default!;      // e.g. "c_123"
    public string Name { get; set; } = default!;
    public string Shift { get; set; } = "Morning Shift"; // Morning Shift, Day Shift, Evening Shift
    public int TotalSeats { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Computed display name (e.g. "Class 6 - Morning Shift" or just "Class 6" if shift is already included)
    public string DisplayName =>
        string.IsNullOrWhiteSpace(Shift) || Name.Contains(Shift, StringComparison.OrdinalIgnoreCase)
            ? Name
            : $"{Name} - {Shift}";
}

public class Hold
{
    public string Id { get; set; } = default!;      // e.g. "h_789"
    public string ClassId { get; set; } = default!;
    public string StudentId { get; set; } = default!; // 17-digit birth registration number
    public string? UserId { get; set; }              // Associated parent user (if logged in)
    public HoldStatus Status { get; set; }
    public DateTime ExpiresAt { get; set; }          // UTC
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ConfirmedAt { get; set; }

    public SchoolClass? Class { get; set; }
    public User? User { get; set; }
}
