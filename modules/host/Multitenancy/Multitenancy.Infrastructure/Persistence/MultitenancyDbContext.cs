using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence;

/// <summary>Platform data: lives in the default database and is shared by all tenants.</summary>
public sealed class MultitenancyDbContext(DbContextOptions<MultitenancyDbContext> options, ICurrentTenant currentTenant)
    : ModuleDbContext(options, currentTenant)
{
    protected override string Schema => SchemaNames.Multitenancy;

    // Platform data shared by all tenants: no TenantId column or tenant filter.
    protected override bool IsTenantScoped => false;

    public DbSet<TenantProvisioning> Provisionings => Set<TenantProvisioning>();
}

public sealed class MultitenancyDbInitializer(MultitenancyDbContext dbContext)
    : DbInitializer<MultitenancyDbContext>(dbContext), IControlPlaneDbInitializer
{
    protected override Task SeedAsync(MultitenancyDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}
