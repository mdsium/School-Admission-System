using System.Security.Claims;
using System.Text;
using Admission.Api;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Ensure default listening on port 8080 as specified in assignment brief (§1.2 & §1.4)
var defaultUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://+:8080";
builder.WebHost.UseUrls(defaultUrls);

// ---- configuration (all overridable via environment variables) ----
var connectionString =
    Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5432;Database=admission;Username=postgres;Password=postgres";

var holdSeconds = int.TryParse(Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS"), out var s) && s > 0 ? s : 600;

var allowedOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "http://localhost:3000,http://localhost:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
                ?? builder.Configuration["Jwt:Secret"]
                ?? "SchoolAdmissionSuperSecretKey2026!OnnorokomProjuktiLimited1234567890";

builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddSingleton(new AdmissionOptions { HoldDurationSeconds = holdSeconds });
builder.Services.AddScoped<AdmissionService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddHostedService<ExpirySweeper>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "SchoolAdmission",
            ValidAudience = "SchoolAdmissionApp",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole(Roles.Admin));
    options.AddPolicy("ParentOnly", policy => policy.RequireRole(Roles.Parent));
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(allowedOrigins)
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

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

// Create schema on startup & seed initial admin (retry while Postgres boots).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            await db.SeedAsync();
            break;
        }
        catch (Exception ex) when (attempt < 30)
        {
            app.Logger.LogWarning("Database not ready (attempt {Attempt}): {Message}. Retrying...", attempt, ex.Message);
            await Task.Delay(2000);
        }
    }
}

const string StudentHeader = "X-Student-Id";
string? Student(HttpRequest r) => r.Headers[StudentHeader].FirstOrDefault();
string? CurrentUserId(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier);

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ==========================================
// 1. Authentication Endpoints
// ==========================================

app.MapPost("/api/auth/register", async (RegisterRequest req, AuthService auth, CancellationToken ct) =>
{
    var res = await auth.RegisterParentAsync(req, ct);
    return Results.Created("/api/auth/me", res);
});

app.MapPost("/api/auth/login", async (LoginRequest req, AuthService auth, CancellationToken ct) =>
{
    var res = await auth.LoginAsync(req, ct);
    return Results.Ok(res);
});

app.MapGet("/api/auth/me", [Authorize] async (ClaimsPrincipal user, AuthService auth, CancellationToken ct) =>
{
    var userId = CurrentUserId(user);
    if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();
    var res = await auth.GetUserByIdAsync(userId, ct);
    return Results.Ok(res);
});

app.MapPost("/api/auth/change-password", [Authorize] async (ChangePasswordRequest req, ClaimsPrincipal user, AuthService auth, CancellationToken ct) =>
{
    var userId = CurrentUserId(user);
    if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();
    var res = await auth.ChangePasswordAsync(userId, req, ct);
    return Results.Ok(res);
});

// ==========================================
// 2. Admin APIs (Require Admin Role)
// ==========================================

app.MapGet("/api/admin/overview", [Authorize(Roles = Roles.Admin)] async (AdmissionService svc, CancellationToken ct) =>
    Results.Ok(await svc.AdminOverviewAsync(ct)));

app.MapGet("/api/admin/classes", [Authorize(Roles = Roles.Admin)] async (AdmissionService svc, CancellationToken ct) =>
    Results.Ok(await svc.ListClassesAsync(ct)));

app.MapPost("/api/admin/classes", [Authorize(Roles = Roles.Admin)] async (CreateAdminClassRequest req, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.CreateClassAsync(req.Name, req.TotalSeats, ct, req.Shift);
    return Results.Created($"/classes/{c.Id}", c);
});

app.MapPut("/api/admin/classes/{classId}", [Authorize(Roles = Roles.Admin)] async (string classId, UpdateAdminClassRequest req, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.UpdateClassAsync(classId, req.Name, req.Shift, req.TotalSeats, ct);
    return Results.Ok(c);
});

app.MapGet("/api/admin/applications", [Authorize(Roles = Roles.Admin)] async (string? status, AdmissionService svc, CancellationToken ct) =>
    Results.Ok(await svc.AdminListApplicationsAsync(status, ct)));

// ==========================================
// 3. Assignment Contract Endpoints (§1.4)
// (Accessible for Parent & automated evaluation)
// ==========================================

app.MapPost("/classes", async (CreateClassRequest req, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.CreateClassAsync(req.Name, req.TotalSeats, ct);
    return Results.Created($"/classes/{c.Id}", new { id = c.Id, name = c.Name, totalSeats = c.TotalSeats });
});

app.MapGet("/classes", async (AdmissionService svc, CancellationToken ct) =>
    Results.Ok(await svc.ListClassesAsync(ct)));

app.MapGet("/classes/{classId}", async (string classId, AdmissionService svc, CancellationToken ct) =>
{
    var c = await svc.GetClassAsync(classId, ct);
    return Results.Ok(new { c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, c.AvailableSeats });
});

app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest r, ClaimsPrincipal user, AdmissionService svc, CancellationToken ct) =>
{
    var userId = CurrentUserId(user);
    var h = await svc.CreateHoldAsync(classId, Student(r), ct, userId);
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

app.MapGet("/me/holds", async (HttpRequest r, ClaimsPrincipal user, AdmissionService svc, CancellationToken ct) =>
{
    var userId = CurrentUserId(user);
    return Results.Ok(await svc.MyHoldsAsync(Student(r), ct, userId));
});

app.Run();

public record CreateClassRequest(string? Name, int TotalSeats);
public record CreateAdminClassRequest(string? Name, string? Shift, int TotalSeats);
public record UpdateAdminClassRequest(string? Name, string? Shift, int TotalSeats);

public partial class Program { }
