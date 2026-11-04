using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Builds the DbContexts for `dotnet ef`. Used by the design-time factories in src/migrations/*.
/// Set MIGRATIONS_CONNECTION to point the tooling at a specific database; migrations generation
/// does not need the database to exist.
/// </summary>
public static class DesignTimeContexts
{
    /// <summary>The tenant while generating migrations (the model does not depend on its value).</summary>
    public static ICurrentTenant Tenant { get; } = new DesignTimeTenant();

    private sealed class DesignTimeTenant : ICurrentTenant
    {
        public string Id => "root";
    }

    public static AppDbContext CreateApp(DatabaseProvider provider)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>();
        DatabaseProviders.Configure(builder, provider, ConnectionString(provider),
            ModuleDbContextRegistration.HistoryTable("App"));
        return new AppDbContext(builder.Options, Tenant);
    }

    public static TenantStoreDbContext CreateTenantStore(DatabaseProvider provider)
    {
        var builder = new DbContextOptionsBuilder<TenantStoreDbContext>();
        DatabaseProviders.Configure(builder, provider, ConnectionString(provider));
        return new TenantStoreDbContext(builder.Options);
    }

    /// <summary>Options for a module DbContext (same history table as at runtime). Usage: new AuthDbContext(ModuleOptions&lt;AuthDbContext&gt;(provider, "Auth")).</summary>
    public static DbContextOptions<TContext> ModuleOptions<TContext>(DatabaseProvider provider, string moduleName)
        where TContext : DbContext
    {
        var builder = new DbContextOptionsBuilder<TContext>();
        DatabaseProviders.Configure(builder, provider, ConnectionString(provider),
            ModuleDbContextRegistration.HistoryTable(moduleName), schema: moduleName);
        return builder.Options;
    }

    /// <summary>MIGRATIONS_CONNECTION, else a local default for the provider. Generating migrations does not connect.</summary>
    public static string DefaultConnectionString(DatabaseProvider provider) => ConnectionString(provider);

    private static string ConnectionString(DatabaseProvider provider)
        => Environment.GetEnvironmentVariable("MIGRATIONS_CONNECTION") ?? provider switch
        {
            DatabaseProvider.SqlServer => "Server=(localdb)\\mssqllocaldb;Database=ModularBlazor;Trusted_Connection=True;",
            DatabaseProvider.PostgreSql => "Host=localhost;Database=modularblazor;Username=postgres;Password=postgres",
            DatabaseProvider.MySql => "Server=localhost;Database=modularblazor;User=root;Password=root",
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null)
        };
}
