using Finbuckle.MultiTenant.Abstractions;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Tenancy.Abstractions;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.Identity;

/// <summary>
/// The tenant of the current scope: the one set for provisioning (outside a request), else the one Finbuckle
/// resolved from the X-Tenant header, else the root tenant.
/// </summary>
internal sealed class CurrentTenant(IMultiTenantContextAccessor<AppTenantInfo> accessor, TenantDatabaseResolver database) : ICurrentTenant
{
    public string Id => database.TenantId
        ?? accessor.MultiTenantContext?.TenantInfo?.Id
        ?? ITenantService.RootTenantId;
}
