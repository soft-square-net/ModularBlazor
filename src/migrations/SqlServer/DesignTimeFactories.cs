using Microsoft.EntityFrameworkCore.Design;
using ModularBlazor.Core;
using ModularBlazor.Infrastructure.MultiTenancy;
using ModularBlazor.Infrastructure.Persistence;

namespace ModularBlazor.Migrations.SqlServer;

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
