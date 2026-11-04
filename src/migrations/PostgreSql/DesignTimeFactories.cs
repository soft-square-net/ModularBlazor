using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Migrations.PostgreSql;

// Lets `dotnet ef` create the contexts without running the API. Generated migrations go to
// Migrations/App and Migrations/TenantStore (see scripts/add-migration.*).

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateApp(DatabaseProvider.PostgreSql);
}

public sealed class TenantStoreDbContextFactory : IDesignTimeDbContextFactory<TenantStoreDbContext>
{
    public TenantStoreDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateTenantStore(DatabaseProvider.PostgreSql);
}

public sealed class AuthDbContextFactory : IDesignTimeDbContextFactory<AuthDbContext>
{
    public AuthDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<AuthDbContext>(DatabaseProvider.PostgreSql, "Auth"), DesignTimeContexts.Tenant);
}

public sealed class CatalogDbContextFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<CatalogDbContext>(DatabaseProvider.PostgreSql, "Catalog"), DesignTimeContexts.Tenant);
}

public sealed class MultitenancyDbContextFactory : IDesignTimeDbContextFactory<MultitenancyDbContext>
{
    public MultitenancyDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<MultitenancyDbContext>(DatabaseProvider.PostgreSql, "Multitenancy"), DesignTimeContexts.Tenant);
}
