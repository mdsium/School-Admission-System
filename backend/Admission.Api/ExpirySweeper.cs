namespace Admission.Api;

/// Housekeeping: marks stale HELD rows as EXPIRED every few seconds.
/// Seat counts never depend on this (they filter on ExpiresAt), so a slow or dead
/// sweeper cannot cause over- or under-booking.
public class ExpirySweeper : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ExpirySweeper> _log;

    public ExpirySweeper(IServiceScopeFactory scopes, ILogger<ExpirySweeper> log)
    {
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                using var scope = _scopes.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<AdmissionService>();
                var n = await svc.SweepExpiredAsync(stoppingToken);
                if (n > 0) _log.LogInformation("Expired {Count} stale holds", n);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { _log.LogWarning(ex, "Sweeper iteration failed"); }
        }
    }
}
