using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.ModularBlazor.Core;
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
