using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Registrations;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>
/// A client module that needs host modules is registered switched off. When the API starts again with those host modules built in,
/// this switches it on. Retries for a while because the database may still be migrating when the app starts.
/// </summary>
internal sealed class PendingRegistrationActivator(IServiceScopeFactory scopes, ILogger<PendingRegistrationActivator> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        for (var attempt = 1; attempt <= 6 && !stoppingToken.IsCancellationRequested; attempt++)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5 * attempt), stoppingToken);
                await using var scope = scopes.CreateAsyncScope();
                var activated = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ActivatePendingRegistrationsCommand(), stoppingToken);
                if (activated > 0) logger.LogInformation("Switched on {Count} client module(s) that were waiting for their host modules.", activated);
                return;
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Activating pending client modules failed (attempt {Attempt}).", attempt);
            }
        }
    }
}
