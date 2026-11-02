using Elsa.Common.Multitenancy;
using Finbuckle.MultiTenant.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure.Tenancy;

// ----------------------------------------------------------------------------------------------------------
// One tenant model for the whole API: Finbuckle's tenant store (AppTenantInfo) is the single source of truth.
// Elsa asks two questions, and both are answered from it:
//   1. "Which tenant is this request/operation for?"  -> FinbuckleTenantResolver (the tenant Finbuckle resolved
//      from the X-Tenant header; "root" when there is none), so Elsa never needs its own header/claim strategy.
//   2. "Which tenants exist?"                         -> FinbuckleTenantsProvider (active, non-expired tenants
//      of the tenant store), so creating or deactivating a tenant in /api/v1/tenants also does so for Elsa.
// The Elsa tenant id IS the Finbuckle tenant id. Elsa keeps every tenant's workflows in one database (a TenantId
// column), so it uses the default database; per-tenant databases stay for the business modules.
//
// This is the only file that touches Elsa's tenant API (Elsa.Common.Multitenancy). If your Elsa version names
// those types or members differently, adjust this file only.
// ----------------------------------------------------------------------------------------------------------

/// <summary>Tells Elsa the tenant that Finbuckle resolved for the current request.</summary>
internal sealed class FinbuckleTenantResolver(ICurrentTenant currentTenant) : ITenantResolver
{
    public ValueTask<TenantResolverResult> ResolveAsync(TenantResolverContext context)
        => ValueTask.FromResult(TenantResolverResult.Resolved(currentTenant.Id));
}

/// <summary>Elsa's list of tenants, read from the Finbuckle tenant store.</summary>
internal sealed class FinbuckleTenantsProvider(IServiceScopeFactory scopeFactory, TimeProvider clock) : ITenantsProvider
{
    public async Task<IEnumerable<Tenant>> ListAsync(CancellationToken cancellationToken = default)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>();
        var now = clock.GetUtcNow().UtcDateTime;

        return (await store.GetAllAsync())
            .Where(t => t.IsValid(now) && !string.IsNullOrEmpty(t.Id))
            .Select(t => new Tenant { Id = t.Id!, Name = t.Name ?? t.Id! })
            .ToList();
    }

    public async Task<Tenant?> FindAsync(TenantFilter filter, CancellationToken cancellationToken = default)
        => (await ListAsync(cancellationToken)).FirstOrDefault(t => filter.Id is null || t.Id == filter.Id);
}
