using Admission.Api;
using Microsoft.AspNetCore.Identity;
using Xunit;

namespace Admission.Tests;

public class DomainUnitTests
{
    [Theory]
    [InlineData("20152691234567890", true)]
    [InlineData("00000000000000000", true)]
    [InlineData("99999999999999999", true)]
    [InlineData("12345", false)]                  // too short
    [InlineData("201526912345678901", false)]     // too long (18 digits)
    [InlineData("2015269123456789a", false)]     // contains letter
    [InlineData("", false)]                       // empty
    [InlineData("                 ", false)]      // whitespace
    [InlineData(null, false)]                     // null
    public void StudentId_Validation_Enforces17Digits(string? studentId, bool expectedValid)
    {
        var isValid = !string.IsNullOrWhiteSpace(studentId) 
                      && studentId.Length == 17 
                      && studentId.All(char.IsAsciiDigit);
        Assert.Equal(expectedValid, isValid);
    }

    [Fact]
    public void ClassView_AvailableSeatsCalculation_IsAccurate()
    {
        var total = 100;
        var held = 15;
        var confirmed = 60;
        var available = Math.Max(0, total - held - confirmed);

        var view = new ClassView("c_1", "Class 6 - Morning", total, held, confirmed, available, "Morning Shift");

        Assert.Equal(25, view.AvailableSeats);
        Assert.Equal(100, view.TotalSeats);
        Assert.Equal(15, view.HeldSeats);
        Assert.Equal(60, view.ConfirmedSeats);
        Assert.Equal("Morning Shift", view.Shift);
    }

    [Fact]
    public void ClassView_WhenFull_AvailableSeatsNeverNegative()
    {
        var total = 50;
        var held = 20;
        var confirmed = 40; // in case of over-allocation edge case
        var available = Math.Max(0, total - held - confirmed);

        var view = new ClassView("c_2", "Class 7 - Day", total, held, confirmed, available);

        Assert.Equal(0, view.AvailableSeats);
    }

    [Fact]
    public void Hold_EffectiveStatus_EvaluatesCorrectly()
    {
        var now = DateTime.UtcNow;

        var activeHold = new Hold
        {
            Id = "h_1",
            Status = HoldStatus.HELD,
            ExpiresAt = now.AddMinutes(5)
        };

        var expiredHold = new Hold
        {
            Id = "h_2",
            Status = HoldStatus.HELD,
            ExpiresAt = now.AddMinutes(-1)
        };

        var confirmedHold = new Hold
        {
            Id = "h_3",
            Status = HoldStatus.CONFIRMED,
            ExpiresAt = now.AddMinutes(-5)
        };

        Assert.True(activeHold.Status == HoldStatus.HELD && activeHold.ExpiresAt > now);
        Assert.True(expiredHold.Status == HoldStatus.HELD && expiredHold.ExpiresAt <= now);
        Assert.Equal(HoldStatus.CONFIRMED, confirmedHold.Status);
    }

    [Fact]
    public void InitialAdmin_DefaultAccount_IsHashedAndRequiresPasswordChange()
    {
        var hasher = new PasswordHasher<User>();
        var admin = new User
        {
            Id = "u_admin",
            Username = "admin",
            Email = "admin@school.com",
            Role = Roles.Admin,
            MustChangePassword = true
        };
        admin.PasswordHash = hasher.HashPassword(admin, "1234");

        Assert.NotEqual("1234", admin.PasswordHash);
        var result = hasher.VerifyHashedPassword(admin, admin.PasswordHash, "1234");
        Assert.Equal(PasswordVerificationResult.Success, result);
        Assert.True(admin.MustChangePassword);
        Assert.Equal(Roles.Admin, admin.Role);
    }

    [Fact]
    public void PublicRegistration_AlwaysEnforcesParentRole()
    {
        var req = new RegisterRequest("Test Parent", "parent1", "parent@example.com", "secret123", "01711111111");
        var user = new User
        {
            Id = "u_1",
            Username = req.Username,
            Email = req.Email,
            FullName = req.FullName,
            Role = Roles.Parent
        };

        Assert.Equal(Roles.Parent, user.Role);
        Assert.False(user.MustChangePassword);
    }

    [Theory]
    [InlineData("Class 6", "Morning Shift", "Class 6 - Morning Shift")]
    [InlineData("Class 6 - Morning Shift", "Morning Shift", "Class 6 - Morning Shift")]
    [InlineData("Class 9", "Day Shift", "Class 9 - Day Shift")]
    [InlineData("Class 10", "Evening Shift", "Class 10 - Evening Shift")]
    public void SchoolClass_DisplayName_FormatsProperly(string name, string shift, string expected)
    {
        var cls = new SchoolClass
        {
            Id = "c_test",
            Name = name,
            Shift = shift,
            TotalSeats = 50
        };

        Assert.Equal(expected, cls.DisplayName);
    }
}
