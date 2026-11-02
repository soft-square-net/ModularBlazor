using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;

public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : ModuleDbContext(options)
{
    protected override string Schema => SchemaNames.Catalog;

    public DbSet<ModuleRegistration> Modules => Set<ModuleRegistration>();
}
