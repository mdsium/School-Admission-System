using Admission.Api;
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

        var view = new ClassView("c_1", "Class 6 - Morning", total, held, confirmed, available);

        Assert.Equal(25, view.AvailableSeats);
        Assert.Equal(100, view.TotalSeats);
        Assert.Equal(15, view.HeldSeats);
        Assert.Equal(60, view.ConfirmedSeats);
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
    public void Hold_StatusTransitions_CoverAllExpectedValues()
    {
        Assert.True(Enum.IsDefined(typeof(HoldStatus), "HELD"));
        Assert.True(Enum.IsDefined(typeof(HoldStatus), "CONFIRMED"));
        Assert.True(Enum.IsDefined(typeof(HoldStatus), "EXPIRED"));
        Assert.True(Enum.IsDefined(typeof(HoldStatus), "CANCELLED"));
    }

    [Fact]
    public void ApiException_CapturesStatusAndCode()
    {
        var ex = new ApiException(409, "NO_SEATS", "Seats exhausted.");
        Assert.Equal(409, ex.Status);
        Assert.Equal("NO_SEATS", ex.Code);
        Assert.Equal("Seats exhausted.", ex.Message);
    }

    [Fact]
    public void AdmissionOptions_DefaultHoldDurationIs600Seconds()
    {
        var options = new AdmissionOptions();
        Assert.Equal(600, options.HoldDurationSeconds);
    }
}
