using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Tenancy;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application;

public sealed record TenantProvisioningDto(
    Guid Id, string TenantId, string Status, int Attempts, string? Error, DateTime? StartedUtc, DateTime? CompletedUtc);

public static class TenantProvisioningMapping
{
    public static TenantProvisioningDto ToDto(this TenantProvisioning p)
        => new(p.Id, p.TenantId, p.Status.ToString(), p.Attempts, p.Error, p.StartedUtc, p.CompletedUtc);
}

/// <summary>Runs a provisioning attempt: creates/migrates/seeds the tenant's database and records the outcome.</summary>
public sealed class TenantProvisioningRunner(
    ITenantService tenants, IRepository<TenantProvisioning> provisionings, TimeProvider clock)
{
    public async Task<TenantProvisioning> RunAsync(TenantProvisioning provisioning, CancellationToken cancellationToken)
    {
        provisioning.Start(clock.GetUtcNow().UtcDateTime);
        await provisionings.SaveChangesAsync(cancellationToken);

        try
        {
            await tenants.ProvisionAsync(provisioning.TenantId, cancellationToken);
            provisioning.Complete(clock.GetUtcNow().UtcDateTime);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            provisioning.Fail(ex.Message, clock.GetUtcNow().UtcDateTime);
        }

        await provisionings.SaveChangesAsync(cancellationToken);
        return provisioning;
    }
}
