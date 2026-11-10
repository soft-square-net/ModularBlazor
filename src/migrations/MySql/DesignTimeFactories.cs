using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Migrations.MySql;

// Lets `dotnet ef` create the contexts without running the API. Generated migrations go to
// Migrations/App and Migrations/TenantStore (see scripts/add-migration.*).

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateApp(DatabaseProvider.MySql);
}

public sealed class TenantStoreDbContextFactory : IDesignTimeDbContextFactory<TenantStoreDbContext>
{
    public TenantStoreDbContext CreateDbContext(string[] args) => DesignTimeContexts.CreateTenantStore(DatabaseProvider.MySql);
}

public sealed class AuthDbContextFactory : IDesignTimeDbContextFactory<AuthDbContext>
{
    public AuthDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<AuthDbContext>(DatabaseProvider.MySql, "Auth"), DesignTimeContexts.Tenant);
}

public sealed class CatalogDbContextFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<CatalogDbContext>(DatabaseProvider.MySql, "Catalog"), DesignTimeContexts.Tenant);
}

public sealed class MultitenancyDbContextFactory : IDesignTimeDbContextFactory<MultitenancyDbContext>
{
    public MultitenancyDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<MultitenancyDbContext>(DatabaseProvider.MySql, "Multitenancy"), DesignTimeContexts.Tenant);
}

public sealed class TodoDbContextFactory : IDesignTimeDbContextFactory<TodoDbContext>
{
    public TodoDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<TodoDbContext>(DatabaseProvider.MySql, "Todo"), DesignTimeContexts.Tenant);
}

public sealed class MediaDbContextFactory : IDesignTimeDbContextFactory<MediaDbContext>
{
    public MediaDbContext CreateDbContext(string[] args)
        => new(DesignTimeContexts.ModuleOptions<MediaDbContext>(DatabaseProvider.MySql, "Media"), DesignTimeContexts.Tenant);
}
