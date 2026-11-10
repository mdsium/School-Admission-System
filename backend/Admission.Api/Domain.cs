namespace Admission.Api;

public enum HoldStatus
{
    HELD,
    CONFIRMED,
    EXPIRED,
    CANCELLED
}

public class SchoolClass
{
    public string Id { get; set; } = default!;      // e.g. "c_123"
    public string Name { get; set; } = default!;
    public int TotalSeats { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Hold
{
    public string Id { get; set; } = default!;      // e.g. "h_789"
    public string ClassId { get; set; } = default!;
    public string StudentId { get; set; } = default!; // 17-digit birth registration number
    public HoldStatus Status { get; set; }
    public DateTime ExpiresAt { get; set; }          // UTC
    public DateTime CreatedAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }

    public SchoolClass? Class { get; set; }
}
