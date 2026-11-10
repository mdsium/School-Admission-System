using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Admission.Tests;

/// Integration tests against a REAL PostgreSQL (row locks cannot be faked with in-memory DBs).
/// Start the DB first:  docker compose up -d db
/// Override with TEST_DB_CONNECTION_STRING if needed.
public class AppFactory : WebApplicationFactory<Program>
{
    public int HoldDurationSeconds { get; set; } = 600;

    public AppFactory()
    {
        Environment.SetEnvironmentVariable("DB_CONNECTION_STRING",
            Environment.GetEnvironmentVariable("TEST_DB_CONNECTION_STRING")
            ?? "Host=localhost;Port=5432;Database=admission_test;Username=postgres;Password=postgres");
        Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", HoldDurationSeconds.ToString());
    }
}

[Collection("serial-db")]
public class ConcurrencyTests : IClassFixture<AppFactory>
{
    private readonly HttpClient _http;
    public ConcurrencyTests(AppFactory f) => _http = f.CreateClient();

    private static string Sid(int n) => (20150000000000000L + n).ToString(); // 17 digits

    private async Task<string> NewClass(int seats)
    {
        var r = await _http.PostAsJsonAsync("/classes", new { name = "T-" + Guid.NewGuid().ToString("N")[..6], totalSeats = seats });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private Task<HttpResponseMessage> Hold(string classId, string student)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds");
        req.Headers.Add("X-Student-Id", student);
        return _http.SendAsync(req);
    }

    [Fact]
    public async Task OneSeat_ManyStudentsAtOnce_ExactlyOneWins()
    {
        var cid = await NewClass(1);
        var results = await Task.WhenAll(Enumerable.Range(1, 50).Select(i => Task.Run(() => Hold(cid, Sid(i)))));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(49, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task TenSeats_HundredRequests_NeverOversells()
    {
        var cid = await NewClass(10);
        var results = await Task.WhenAll(Enumerable.Range(1, 100).Select(i => Task.Run(() => Hold(cid, Sid(1000 + i)))));

        Assert.Equal(10, results.Count(r => r.StatusCode == HttpStatusCode.Created));

        var c = await _http.GetFromJsonAsync<JsonElement>($"/classes/{cid}");
        Assert.Equal(10, c.GetProperty("heldSeats").GetInt32() + c.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task SameStudent_ParallelRequests_OnlyOneHold()
    {
        var cid = await NewClass(5);
        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => Hold(cid, Sid(777)))));
        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
    }

    [Fact]
    public async Task Cancel_FreesSeat_ForNextStudent()
    {
        var cid = await NewClass(1);
        var first = await Hold(cid, Sid(1));
        var holdId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("holdId").GetString();

        Assert.Equal(HttpStatusCode.Conflict, (await Hold(cid, Sid(2))).StatusCode);

        var del = new HttpRequestMessage(HttpMethod.Delete, $"/holds/{holdId}");
        del.Headers.Add("X-Student-Id", Sid(1));
        Assert.Equal(HttpStatusCode.NoContent, (await _http.SendAsync(del)).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await Hold(cid, Sid(2))).StatusCode);
    }

    [Fact]
    public async Task Confirm_ByOtherStudent_Forbidden_AndOwnerSucceeds()
    {
        var cid = await NewClass(2);
        var holdId = (await (await Hold(cid, Sid(1))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("holdId").GetString();

        var bad = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdId}/confirm");
        bad.Headers.Add("X-Student-Id", Sid(2));
        Assert.Equal(HttpStatusCode.Forbidden, (await _http.SendAsync(bad)).StatusCode);

        var ok = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdId}/confirm");
        ok.Headers.Add("X-Student-Id", Sid(1));
        Assert.Equal(HttpStatusCode.OK, (await _http.SendAsync(ok)).StatusCode);

        var again = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdId}/confirm");
        again.Headers.Add("X-Student-Id", Sid(1));
        Assert.Equal(HttpStatusCode.Conflict, (await _http.SendAsync(again)).StatusCode);
    }

    [Fact]
    public async Task InvalidStudentId_Returns400()
    {
        var cid = await NewClass(1);
        Assert.Equal(HttpStatusCode.BadRequest, (await Hold(cid, "123")).StatusCode);
    }
}

/// Separate fixture with a 1-second hold so we can observe expiry for real.
[Collection("serial-db")]
public class ExpiryTests : IClassFixture<ExpiryTests.ShortHoldFactory>
{
    public class ShortHoldFactory : AppFactory
    {
        public ShortHoldFactory()
        {
            HoldDurationSeconds = 1;
            Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", "1");
        }
    }

    private readonly HttpClient _http;
    public ExpiryTests(ShortHoldFactory f) => _http = f.CreateClient();

    [Fact]
    public async Task ExpiredHold_ReleasesSeat_AndCannotBeConfirmed()
    {
        var r = await _http.PostAsJsonAsync("/classes", new { name = "Exp", totalSeats = 1 });
        var cid = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

        HttpRequestMessage Req(string url, string sid, HttpMethod m)
        { var q = new HttpRequestMessage(m, url); q.Headers.Add("X-Student-Id", sid); return q; }

        var h1 = await _http.SendAsync(Req($"/classes/{cid}/holds", "20150000000000001", HttpMethod.Post));
        var holdId = (await h1.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("holdId").GetString();

        Assert.Equal(HttpStatusCode.Conflict,
            (await _http.SendAsync(Req($"/classes/{cid}/holds", "20150000000000002", HttpMethod.Post))).StatusCode);

        await Task.Delay(1500); // hold expires

        Assert.Equal(HttpStatusCode.Conflict,
            (await _http.SendAsync(Req($"/holds/{holdId}/confirm", "20150000000000001", HttpMethod.Post))).StatusCode);

        Assert.Equal(HttpStatusCode.Created,
            (await _http.SendAsync(Req($"/classes/{cid}/holds", "20150000000000002", HttpMethod.Post))).StatusCode);

        var status = await _http.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("EXPIRED", status.GetProperty("status").GetString());
    }
}
