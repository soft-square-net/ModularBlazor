using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;

public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options, ICurrentTenant currentTenant)
    : ModuleDbContext(options, currentTenant)
{
    protected override string Schema => SchemaNames.Catalog;

    // The module list is one catalog for the whole installation: every tenant (and the signed-out core manifest) sees the same rows.
    protected override bool IsTenantScoped => false;

    public DbSet<ModuleRegistration> Modules => Set<ModuleRegistration>();
}
