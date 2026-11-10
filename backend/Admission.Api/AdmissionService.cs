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

public record ClassView(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
public record HoldView(string HoldId, string ClassId, string? StudentId, string Status, DateTime ExpiresAt);

public class AdmissionOptions
{
    public int HoldDurationSeconds { get; set; } = 600;
}

/// <summary>
/// Core business rules.
///
/// CONCURRENCY STRATEGY
/// Every operation that can change seat availability for a class (create hold, confirm,
/// cancel) runs in a transaction that first takes a row lock on the class row:
///     SELECT ... FROM classes WHERE "Id" = @id FOR UPDATE
/// Concurrent requests for the same class are therefore serialized by PostgreSQL, so the
/// "count seats, then insert" sequence can never interleave. Different classes do not block
/// each other. This also works when several backend instances run against one database.
/// A partial unique index on holds is a second line of defence for the one-live-hold rule.
///
/// EXPIRY STRATEGY
/// A HELD row is considered live only while ExpiresAt > now. Expiry is enforced lazily
/// (every read/write filters on ExpiresAt) so correctness never depends on a timer. A
/// background sweeper additionally flips stale rows to EXPIRED to keep the table tidy.
/// </summary>
public class AdmissionService
{
    private readonly AppDbContext _db;
    private readonly AdmissionOptions _opt;

    public AdmissionService(AppDbContext db, AdmissionOptions opt)
    {
        _db = db;
        _opt = opt;
    }

    // ---------- helpers ----------

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
        // ExecuteSql returns -1 for SELECT; verify existence separately.
        var exists = await _db.Classes.AsNoTracking().AnyAsync(c => c.Id == classId, ct);
        if (!exists) throw new ApiException(404, "CLASS_NOT_FOUND", "Class not found.");
    }

    /// Flip any stale HELD rows of this class to EXPIRED (called while holding the class lock).
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

    public async Task<ClassView> CreateClassAsync(string? name, int totalSeats, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ApiException(400, "INVALID_NAME", "name is required.");
        if (name.Length > 200)
            throw new ApiException(400, "INVALID_NAME", "name is too long (max 200).");
        if (totalSeats <= 0 || totalSeats > 100_000)
            throw new ApiException(400, "INVALID_SEATS", "totalSeats must be a positive integer.");

        var c = new SchoolClass { Id = NewId("c"), Name = name.Trim(), TotalSeats = totalSeats, CreatedAt = DateTime.UtcNow };
        _db.Classes.Add(c);
        await _db.SaveChangesAsync(ct);
        return new ClassView(c.Id, c.Name, c.TotalSeats, 0, 0, c.TotalSeats);
    }

    public async Task<List<ClassView>> ListClassesAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var classes = await _db.Classes.AsNoTracking().OrderBy(c => c.CreatedAt).ToListAsync(ct);

        // One grouped query for all classes (no N+1).
        var counts = await _db.Holds.AsNoTracking()
            .Where(h => h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAt > now))
            .GroupBy(h => new { h.ClassId, h.Status })
            .Select(g => new { g.Key.ClassId, g.Key.Status, Count = g.Count() })
            .ToListAsync(ct);

        return classes.Select(c =>
        {
            var held = counts.FirstOrDefault(x => x.ClassId == c.Id && x.Status == HoldStatus.HELD)?.Count ?? 0;
            var conf = counts.FirstOrDefault(x => x.ClassId == c.Id && x.Status == HoldStatus.CONFIRMED)?.Count ?? 0;
            return new ClassView(c.Id, c.Name, c.TotalSeats, held, conf, Math.Max(0, c.TotalSeats - held - conf));
        }).ToList();
    }

    public async Task<ClassView> GetClassAsync(string classId, CancellationToken ct)
    {
        var c = await _db.Classes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == classId, ct)
                ?? throw new ApiException(404, "CLASS_NOT_FOUND", "Class not found.");
        var (held, conf) = await CountAsync(classId, DateTime.UtcNow, ct);
        return new ClassView(c.Id, c.Name, c.TotalSeats, held, conf, Math.Max(0, c.TotalSeats - held - conf));
    }

    // ---------- holds ----------

    public async Task<HoldView> CreateHoldAsync(string classId, string? studentId, CancellationToken ct)
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
                Status = HoldStatus.HELD,
                CreatedAt = now,
                ExpiresAt = now.AddSeconds(_opt.HoldDurationSeconds)
            };
            _db.Holds.Add(hold);
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new HoldView(hold.Id, hold.ClassId, hold.StudentId, "HELD", hold.ExpiresAt);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ApiException(409, "ALREADY_APPLIED", "You already have an active hold or confirmed seat in this class.");
        }
    }

    public async Task<HoldView> GetHoldAsync(string holdId, CancellationToken ct)
    {
        var h = await _db.Holds.AsNoTracking().FirstOrDefaultAsync(x => x.Id == holdId, ct)
                ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");
        return new HoldView(h.Id, h.ClassId, null, EffectiveStatus(h, DateTime.UtcNow), h.ExpiresAt);
    }

    public async Task<HoldView> ConfirmHoldAsync(string holdId, string? studentId, CancellationToken ct)
    {
        ValidateStudentId(studentId);

        var classId = await _db.Holds.AsNoTracking().Where(h => h.Id == holdId).Select(h => h.ClassId).FirstOrDefaultAsync(ct)
                      ?? throw new ApiException(404, "HOLD_NOT_FOUND", "Hold not found.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await LockClassAsync(classId, ct);
        var now = DateTime.UtcNow;

        var hold = await _db.Holds.FirstOrDefaultAsync(h => h.Id == holdId, ct)
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
        return new HoldView(hold.Id, hold.ClassId, hold.StudentId, "CONFIRMED", hold.ExpiresAt);
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

        // Cancelling an already EXPIRED/CANCELLED hold is idempotent (still 204).
        if (hold.Status == HoldStatus.HELD)
        {
            hold.Status = HoldStatus.CANCELLED;
            await _db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
    }

    public async Task<List<object>> MyHoldsAsync(string? studentId, CancellationToken ct)
    {
        ValidateStudentId(studentId);
        var now = DateTime.UtcNow;
        var rows = await _db.Holds.AsNoTracking()
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new { h, ClassName = h.Class!.Name })
            .ToListAsync(ct);

        return rows.Select(r => (object)new
        {
            holdId = r.h.Id,
            classId = r.h.ClassId,
            className = r.ClassName,
            status = EffectiveStatus(r.h, now),
            expiresAt = r.h.ExpiresAt
        }).ToList();
    }

    /// Persist expiry for stale rows (housekeeping only; correctness does not depend on this).
    public Task<int> SweepExpiredAsync(CancellationToken ct) =>
        _db.Holds.Where(h => h.Status == HoldStatus.HELD && h.ExpiresAt <= DateTime.UtcNow)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, HoldStatus.EXPIRED), ct);
}
