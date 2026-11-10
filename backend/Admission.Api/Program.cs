using Admission.Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- configuration (all overridable via environment variables) ----
var connectionString =
    Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5432;Database=admission;Username=postgres;Password=postgres";

var holdSeconds = int.TryParse(Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS"), out var s) && s > 0 ? s : 600;

var allowedOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "http://localhost:3000,http://localhost:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddSingleton(new AdmissionOptions { HoldDurationSeconds = holdSeconds });
builder.Services.AddScoped<AdmissionService>();
builder.Services.AddHostedService<ExpirySweeper>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var app = builder.Build();

app.UseCors();

// Uniform JSON error body: { "error": "CODE", "message": "..." }
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (ApiException ex)
    {
        ctx.Response.StatusCode = ex.Status;
        await ctx.Response.WriteAsJsonAsync(new { error = ex.Code, message = ex.Message });
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        app.Logger.LogError(ex, "Unhandled error");
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsJsonAsync(new { error = "SERVER_ERROR", message = "Something went wrong." });
    }
});

// Create schema on startup (retry while Postgres boots).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    for (var attempt = 1; ; attempt++)
    {
        try { await db.Database.EnsureCreatedAsync(); break; }
        catch when (attempt < 30)
        {
            app.Logger.LogWarning("Database not ready (attempt {Attempt}), retrying...", attempt);
            await Task.Delay(2000);
        }
    }
}

const string StudentHeader = "X-Student-Id";
string? Student(HttpRequest r) => r.Headers[StudentHeader].FirstOrDefault();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/classes", async (CreateClassRequest req, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.CreateClassAsync(req.Name, req.TotalSeats, ct);
    return Results.Created($"/classes/{c.Id}", new { id = c.Id, name = c.Name, totalSeats = c.TotalSeats });
});

app.MapGet("/classes", async (AdmissionService svc, CancellationToken ct) => Results.Ok(await svc.ListClassesAsync(ct)));

app.MapGet("/classes/{classId}", async (string classId, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.GetClassAsync(classId, ct);
    return Results.Ok(new { c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, c.AvailableSeats });
});

app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest r, AdmissionService svc, CancellationToken ct) =>
{
    var h = await svc.CreateHoldAsync(classId, Student(r), ct);
    return Results.Created($"/holds/{h.HoldId}", new { h.HoldId, h.ClassId, h.StudentId, h.Status, h.ExpiresAt });
});

app.MapGet("/holds/{holdId}", async (string holdId, AdmissionService svc, CancellationToken ct) =>
{
    var h = await svc.GetHoldAsync(holdId, ct);
    return Results.Ok(new { h.HoldId, h.ClassId, h.Status, h.ExpiresAt });
});

app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpRequest r, AdmissionService svc, CancellationToken ct) =>
{
    var h = await svc.ConfirmHoldAsync(holdId, Student(r), ct);
    return Results.Ok(new { h.HoldId, h.Status });
});

app.MapDelete("/holds/{holdId}", async (string holdId, HttpRequest r, AdmissionService svc, CancellationToken ct) =>
{
    await svc.CancelHoldAsync(holdId, Student(r), ct);
    return Results.NoContent();
});

app.MapGet("/me/holds", async (HttpRequest r, AdmissionService svc, CancellationToken ct) =>
    Results.Ok(await svc.MyHoldsAsync(Student(r), ct)));

app.Run();

public record CreateClassRequest(string? Name, int TotalSeats);

public partial class Program { } // for WebApplicationFactory in tests
