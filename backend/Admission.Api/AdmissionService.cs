using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Admission.Api;

public class ApiException : Exception
{
    public int Status { get; }
    public string Code { get; }
    public ApiException(int status, string code, string message) : base(message)
    {
        Status = status;
        Code = code;
    }
}

public record ClassView(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats, string? Shift = null);
public record HoldView(string HoldId, string ClassId, string? StudentId, string Status, DateTime ExpiresAt, string? ClassName = null);

public record AdminOverviewDto(
    int TotalClasses,
    int TotalShifts,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats,
    int TotalApplications
);

public record AdminApplicationDto(
    string HoldId,
    string ClassId,
    string ClassName,
    string Shift,
    string StudentId,
    string? ParentName,
    string? ParentEmail,
    string Status,
    DateTime CreatedAt,
    DateTime ExpiresAt,
    DateTime? ConfirmedAt
);

public class AdmissionOptions
{
    public int HoldDurationSeconds { get; set; } = 600;
}

public class AdmissionService
{
    private readonly AppDbContext _db;
    private readonly AdmissionOptions _opt;

    public AdmissionService(AppDbContext db, AdmissionOptions opt)
    {
        _db = db;
        _opt = opt;
    }

    private static string NewId(string prefix) => prefix + "_" + Guid.NewGuid().ToString("N")[..10];

    private static void ValidateStudentId(string? id)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length != 17 || !id.All(char.IsAsciiDigit))
            throw new ApiException(400, "INVALID_STUDENT_ID", "X-Student-Id must be a 17-digit birth registration number.");
    }

    private async Task LockClassAsync(string classId, CancellationToken ct)
    {
        var rows = await _db.Database
            .ExecuteSqlInterpolatedAsync($"SELECT 1 FROM classes WHERE \"Id\" = {classId} FOR UPDATE", ct);
        var exists = await _db.Classes.AsNoTracking().AnyAsync(c => c.Id == classId, ct);
        if (!exists) throw new ApiException(404, "CLASS_NOT_FOUND", "Class not found.");
    }

    private Task ExpireStaleAsync(string classId, DateTime now, CancellationToken ct) =>
        _db.Holds
            .Where(h => h.ClassId == classId && h.Status == HoldStatus.HELD && h.ExpiresAt <= now)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, HoldStatus.EXPIRED), ct);

    private async Task<(int held, int confirmed)> CountAsync(string classId, DateTime now, CancellationToken ct)
    {
        var grouped = await _db.Holds.AsNoTracking()
            .Where(h => h.ClassId == classId &&
                        (h.Status == HoldStatus.CONFIRMED ||
                         (h.Status == HoldStatus.HELD && h.ExpiresAt > now)))
            .GroupBy(h => h.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        return (grouped.FirstOrDefault(g => g.Status == HoldStatus.HELD)?.Count ?? 0,
                grouped.FirstOrDefault(g => g.Status == HoldStatus.CONFIRMED)?.Count ?? 0);
    }

    private static string EffectiveStatus(Hold h, DateTime now) =>
        h.Status == HoldStatus.HELD && h.ExpiresAt <= now ? nameof(HoldStatus.EXPIRED) : h.Status.ToString();

    // ---------- classes ----------

    public async Task<ClassView> CreateClassAsync(string? name, int totalSeats, CancellationToken ct, string? shift = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ApiException(400, "INVALID_NAME", "name is required.");
        if (name.Length > 200)
            throw new ApiException(400, "INVALID_NAME", "name is too long (max 200).");
        if (totalSeats <= 0 || totalSeats > 100_000)
            throw new ApiException(400, "INVALID_SEATS", "totalSeats must be a positive integer.");

        var finalName = name.Trim();
        var finalShift = string.IsNullOrWhiteSpace(shift) ? "Morning Shift" : shift.Trim();

        // If shift was embedded in name like "Class 6 - Morning Shift", normalize
        if (string.IsNullOrWhiteSpace(shift) && finalName.Contains(" - "))
        {
            var parts = finalName.Split(" - ", 2);
            finalName = parts[0].Trim();
            finalShift = parts[1].Trim();
        }

        var c = new SchoolClass
        {
            Id = NewId("c"),
            Name = finalName,
            Shift = finalShift,
            TotalSeats = totalSeats,
            CreatedAt = DateTime.UtcNow
        };
        _db.Classes.Add(c);
        await _db.SaveChangesAsync(ct);
        return new ClassView(c.Id, c.DisplayName, c.TotalSeats, 0, 0, c.TotalSeats, c.Shift);
    }

    public async Task<ClassView> UpdateClassAsync(string classId, string? name, string? shift, int totalSeats, CancellationToken ct)
    {
        if (totalSeats <= 0 || totalSeats > 100_000)
            throw new ApiException(400, "INVALID_SEATS", "totalSeats must be a positive integer.");

        var c = await _db.Classes.FirstOrDefaultAsync(x => x.Id == classId, ct)
                ?? throw new ApiException(404, "CLASS_NOT_FOUND", "Class not found.");

        if (!string.IsNullOrWhiteSpace(name))
            c.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(shift))
            c.Shift = shift.Trim();

        // Ensure current active seats don't exceed new capacity
        var (held, conf) = await CountAsync(classId, DateTime.UtcNow, ct);
        if (held + conf > totalSeats)
            throw new ApiException(409, "SEAT_LIMIT_CONFLICT", $"Cannot reduce seats to {totalSeats} because {held + conf} seats are currently active ({conf} confirmed, {held} held).");

        c.TotalSeats = totalSeats;
        await _db.SaveChangesAsync(ct);
        return new ClassView(c.Id, c.DisplayName, c.TotalSeats, held, conf, Math.Max(0, c.TotalSeats - held - conf), c.Shift);
    }

    public async Task<List<ClassView>> ListClassesAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var classes = await _db.Classes.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.CreatedAt).ToListAsync(ct);

        var counts = await _db.Holds.AsNoTracking()
            .Where(h => h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAt > now))
            .GroupBy(h => new { h.ClassId, h.Status })
            .Select(g => new { g.Key.ClassId, g.Key.Status, Count = g.Count() })
            .ToListAsync(ct);

        return classes.Select(c =>
        {
            var held = counts.FirstOrDefault(x => x.ClassId == c.Id && x.Status == HoldStatus.HELD)?.Count ?? 0;
            var conf = counts.FirstOrDefault(x => x.ClassId == c.Id && x.Status == HoldStatus.CONFIRMED)?.Count ?? 0;
            return new ClassView(c.Id, c.DisplayName, c.TotalSeats, held, conf, Math.Max(0, c.TotalSeats - held - conf), c.Shift);
        }).ToList();
    }

    public async Task<ClassView> GetClassAsync(string classId, CancellationToken ct)
    {
        var c = await _db.Classes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == classId, ct)
                ?? throw new ApiException(404, "CLASS_NOT_FOUND", "Class not found.");
        var (held, conf) = await CountAsync(classId, DateTime.UtcNow, ct);
        return new ClassView(c.Id, c.DisplayName, c.TotalSeats, held, conf, Math.Max(0, c.TotalSeats - held - conf), c.Shift);
    }

    // ---------- holds ----------

    public async Task<HoldView> CreateHoldAsync(string classId, string? studentId, CancellationToken ct, string? userId = null)
    {
        ValidateStudentId(studentId);

        await using var tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted, ct);
        try
        {
            await LockClassAsync(classId, ct);
            var now = DateTime.UtcNow;
            await ExpireStaleAsync(classId, now, ct);

            var cls = await _db.Classes.AsNoTracking().FirstAsync(c => c.Id == classId, ct);

            // Rule: only one live application (HELD or CONFIRMED) per student per class.
            var already = await _db.Holds.AnyAsync(h => h.ClassId == classId && h.StudentId == studentId &&
                                                         (h.Status == HoldStatus.HELD || h.Status == HoldStatus.CONFIRMED), ct);
            if (already)
                throw new ApiException(409, "ALREADY_APPLIED", "You already have an active hold or confirmed seat in this class.");

            var (held, conf) = await CountAsync(classId, now, ct);
            if (held + conf >= cls.TotalSeats)
                throw new ApiException(409, "NO_SEATS", "No seats available in this class.");

            var hold = new Hold
            {
                Id = NewId("h"),
                ClassId = classId,
                StudentId = studentId!,
                UserId = userId,
                Status = HoldStatus.HELD,
                CreatedAt = now,
                ExpiresAt = now.AddSeconds(_opt.HoldDurationSeconds)
            };
            _db.Holds.Add(hold);
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new HoldView(hold.Id, hold.ClassId, hold.StudentId, "HELD", hold.ExpiresAt, cls.DisplayName);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ApiException(409, "ALREADY_APPLIED", "You already have an active hold or confirmed seat in this class.");
        }
    }

    public async Task<HoldView> GetHoldAsync(string holdId, CancellationToken ct)
    {
        var h = await _db.Holds.AsNoTracking()
            .Include(x => x.Class)
            .FirstOrDefaultAsync(x => x.Id == holdId, ct)
                ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");
        return new HoldView(h.Id, h.ClassId, null, EffectiveStatus(h, DateTime.UtcNow), h.ExpiresAt, h.Class?.DisplayName);
    }

    public async Task<HoldView> ConfirmHoldAsync(string holdId, string? studentId, CancellationToken ct)
    {
        ValidateStudentId(studentId);

        var classId = await _db.Holds.AsNoTracking().Where(h => h.Id == holdId).Select(h => h.ClassId).FirstOrDefaultAsync(ct)
                      ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await LockClassAsync(classId, ct);
        var now = DateTime.UtcNow;

        var hold = await _db.Holds.Include(h => h.Class).FirstOrDefaultAsync(h => h.Id == holdId, ct)
                   ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");

        if (hold.StudentId != studentId)
            throw new ApiException(403, "NOT_OWNER", "This hold belongs to another student.");

        if (hold.Status == HoldStatus.CONFIRMED)
            throw new ApiException(409, "ALREADY_CONFIRMED", "This hold is already confirmed.");
        if (hold.Status == HoldStatus.CANCELLED)
            throw new ApiException(409, "HOLD_CANCELLED", "This hold was cancelled.");
        if (hold.Status == HoldStatus.EXPIRED || hold.ExpiresAt <= now)
        {
            if (hold.Status == HoldStatus.HELD) { hold.Status = HoldStatus.EXPIRED; await _db.SaveChangesAsync(ct); await tx.CommitAsync(ct); }
            throw new ApiException(409, "HOLD_EXPIRED", "This hold has expired.");
        }

        hold.Status = HoldStatus.CONFIRMED;
        hold.ConfirmedAt = now;
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new HoldView(hold.Id, hold.ClassId, hold.StudentId, "CONFIRMED", hold.ExpiresAt, hold.Class?.DisplayName);
    }

    public async Task CancelHoldAsync(string holdId, string? studentId, CancellationToken ct)
    {
        ValidateStudentId(studentId);

        var classId = await _db.Holds.AsNoTracking().Where(h => h.Id == holdId).Select(h => h.ClassId).FirstOrDefaultAsync(ct)
                      ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await LockClassAsync(classId, ct);

        var hold = await _db.Holds.FirstOrDefaultAsync(h => h.Id == holdId, ct)
                   ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");
        if (hold.StudentId != studentId)
            throw new ApiException(403, "NOT_OWNER", "This hold belongs to another student.");
        if (hold.Status == HoldStatus.CONFIRMED)
            throw new ApiException(409, "ALREADY_CONFIRMED", "A confirmed seat cannot be cancelled.");

        if (hold.Status == HoldStatus.HELD)
        {
            hold.Status = HoldStatus.CANCELLED;
            await _db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
    }

    public async Task<List<object>> MyHoldsAsync(string? studentId, CancellationToken ct, string? userId = null)
    {
        ValidateStudentId(studentId);
        var now = DateTime.UtcNow;

        var query = _db.Holds.AsNoTracking().Include(h => h.Class).AsQueryable();

        if (!string.IsNullOrWhiteSpace(userId))
        {
            query = query.Where(h => h.StudentId == studentId || h.UserId == userId);
        }
        else
        {
            query = query.Where(h => h.StudentId == studentId);
        }

        var rows = await query
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(h => (object)new
        {
            holdId = h.Id,
            classId = h.ClassId,
            className = h.Class?.DisplayName ?? "Unknown Class",
            shift = h.Class?.Shift ?? "Morning Shift",
            studentId = h.StudentId,
            status = EffectiveStatus(h, now),
            expiresAt = h.ExpiresAt,
            createdAt = h.CreatedAt,
            confirmedAt = h.ConfirmedAt
        }).ToList();
    }

    // ---------- admin features ----------

    public async Task<AdminOverviewDto> AdminOverviewAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var classes = await _db.Classes.AsNoTracking().ToListAsync(ct);

        var counts = await _db.Holds.AsNoTracking()
            .GroupBy(h => new
            {
                Status = h.Status == HoldStatus.HELD && h.ExpiresAt <= now ? HoldStatus.EXPIRED : h.Status
            })
            .Select(g => new { Status = g.Key.Status, Count = g.Count() })
            .ToListAsync(ct);

        var totalSeats = classes.Sum(c => c.TotalSeats);
        var heldSeats = counts.FirstOrDefault(x => x.Status == HoldStatus.HELD)?.Count ?? 0;
        var confSeats = counts.FirstOrDefault(x => x.Status == HoldStatus.CONFIRMED)?.Count ?? 0;
        var totalShifts = classes.Select(c => c.Shift).Distinct().Count();
        var totalApplications = await _db.Holds.CountAsync(ct);

        return new AdminOverviewDto(
            TotalClasses: classes.Count,
            TotalShifts: totalShifts,
            TotalSeats: totalSeats,
            HeldSeats: heldSeats,
            ConfirmedSeats: confSeats,
            AvailableSeats: Math.Max(0, totalSeats - heldSeats - confSeats),
            TotalApplications: totalApplications
        );
    }

    public async Task<List<AdminApplicationDto>> AdminListApplicationsAsync(string? statusFilter, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var query = _db.Holds.AsNoTracking()
            .Include(h => h.Class)
            .Include(h => h.User)
            .OrderByDescending(h => h.CreatedAt)
            .AsQueryable();

        var list = await query.ToListAsync(ct);

        var result = list.Select(h =>
        {
            var effective = EffectiveStatus(h, now);
            return new AdminApplicationDto(
                HoldId: h.Id,
                ClassId: h.ClassId,
                ClassName: h.Class?.Name ?? "Unknown",
                Shift: h.Class?.Shift ?? "Morning Shift",
                StudentId: h.StudentId,
                ParentName: h.User?.FullName,
                ParentEmail: h.User?.Email,
                Status: effective,
                CreatedAt: h.CreatedAt,
                ExpiresAt: h.ExpiresAt,
                ConfirmedAt: h.ConfirmedAt
            );
        });

        if (!string.IsNullOrWhiteSpace(statusFilter) && statusFilter != "ALL")
        {
            result = result.Where(a => a.Status.Equals(statusFilter, StringComparison.OrdinalIgnoreCase));
        }

        return result.ToList();
    }

    public Task<int> SweepExpiredAsync(CancellationToken ct) =>
        _db.Holds.Where(h => h.Status == HoldStatus.HELD && h.ExpiresAt <= DateTime.UtcNow)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, HoldStatus.EXPIRED), ct);
}
