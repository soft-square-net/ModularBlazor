using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Migrations.SqlServer;

// Lets `dotnet ef` create the contexts without running the API. Generated migrations go to
// Migrations/App and Migrations/TenantStore (see scripts/add-migration.*).

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateApp(DatabaseProvider.SqlServer);
}

public sealed class TenantStoreDbContextFactory : IDesignTimeDbContextFactory<TenantStoreDbContext>
{
    public TenantStoreDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateTenantStore(DatabaseProvider.SqlServer);
}

public sealed class AuthDbContextFactory : IDesignTimeDbContextFactory<AuthDbContext>
{
    public AuthDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<AuthDbContext>(DatabaseProvider.SqlServer, "Auth"));
}

public sealed class CatalogDbContextFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<CatalogDbContext>(DatabaseProvider.SqlServer, "Catalog"));
}

public sealed class MultitenancyDbContextFactory : IDesignTimeDbContextFactory<MultitenancyDbContext>
{
    public MultitenancyDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<MultitenancyDbContext>(DatabaseProvider.SqlServer, "Multitenancy"));
}
