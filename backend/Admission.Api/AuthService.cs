using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Admission.Api;

public record RegisterRequest(string FullName, string Username, string Email, string Password, string? PhoneNumber);
public record LoginRequest(string Username, string Password);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UserDto(string Id, string Username, string Email, string FullName, string? PhoneNumber, string Role, bool MustChangePassword);
public record AuthResponse(string Token, UserDto User);

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly string _jwtSecret;
    private readonly PasswordHasher<User> _hasher = new();

    public AuthService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
                     ?? config["Jwt:Secret"]
                     ?? "SchoolAdmissionSuperSecretKey2026!OnnorokomProjuktiLimited1234567890";
    }

    public async Task<AuthResponse> RegisterParentAsync(RegisterRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.FullName))
            throw new ApiException(400, "INVALID_NAME", "Full name is required.");
        if (string.IsNullOrWhiteSpace(req.Username) || req.Username.Length < 3)
            throw new ApiException(400, "INVALID_USERNAME", "Username must be at least 3 characters.");
        if (string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
            throw new ApiException(400, "INVALID_EMAIL", "A valid email address is required.");
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 4)
            throw new ApiException(400, "INVALID_PASSWORD", "Password must be at least 4 characters.");

        var trimmedUsername = req.Username.Trim().ToLowerInvariant();
        var trimmedEmail = req.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Username.ToLower() == trimmedUsername, ct))
            throw new ApiException(409, "USERNAME_EXISTS", "This username is already taken.");

        if (await _db.Users.AnyAsync(u => u.Email.ToLower() == trimmedEmail, ct))
            throw new ApiException(409, "EMAIL_EXISTS", "This email is already registered.");

        var user = new User
        {
            Id = "u_" + Guid.NewGuid().ToString("N")[..10],
            Username = trimmedUsername,
            Email = trimmedEmail,
            FullName = req.FullName.Trim(),
            PhoneNumber = req.PhoneNumber?.Trim(),
            Role = Roles.Parent, // Public registration is ALWAYS Parent
            MustChangePassword = false,
            CreatedAt = DateTime.UtcNow
        };

        user.PasswordHash = _hasher.HashPassword(user, req.Password);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        var token = GenerateJwt(user);
        return new AuthResponse(token, ToDto(user));
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            throw new ApiException(400, "INVALID_CREDENTIALS", "Username and password are required.");

        var trimmed = req.Username.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == trimmed || u.Email.ToLower() == trimmed, ct);
        if (user == null)
            throw new ApiException(401, "INVALID_CREDENTIALS", "Invalid username or password.");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
        if (result == PasswordVerificationResult.Failed)
            throw new ApiException(401, "INVALID_CREDENTIALS", "Invalid username or password.");

        var token = GenerateJwt(user);
        return new AuthResponse(token, ToDto(user));
    }

    public async Task<UserDto> ChangePasswordAsync(string userId, ChangePasswordRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 4)
            throw new ApiException(400, "INVALID_PASSWORD", "New password must be at least 4 characters.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new ApiException(404, "USER_NOT_FOUND", "User not found.");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword);
        if (result == PasswordVerificationResult.Failed)
            throw new ApiException(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.");

        user.PasswordHash = _hasher.HashPassword(user, req.NewPassword);
        user.MustChangePassword = false;
        await _db.SaveChangesAsync(ct);

        return ToDto(user);
    }

    public async Task<UserDto> GetUserByIdAsync(string userId, CancellationToken ct)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new ApiException(404, "USER_NOT_FOUND", "User not found.");
        return ToDto(user);
    }

    public string GenerateJwt(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("mustChangePassword", user.MustChangePassword.ToString().ToLowerInvariant())
        };

        var token = new JwtSecurityToken(
            issuer: "SchoolAdmission",
            audience: "SchoolAdmissionApp",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static UserDto ToDto(User u) =>
        new(u.Id, u.Username, u.Email, u.FullName, u.PhoneNumber, u.Role, u.MustChangePassword);
}

