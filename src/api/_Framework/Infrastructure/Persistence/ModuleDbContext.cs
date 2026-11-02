using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Base for a module's DbContext. Every IEntityTypeConfiguration in the module's assembly is applied
/// automatically (put them under Persistence/Configurations). Name tables with the module as a prefix
/// (e.g. "Auth_Users"): all modules share the tenant's database, and MySQL has no schemas.
/// </summary>
public abstract class ModuleDbContext(DbContextOptions options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
        => modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly);
}

public static class ModuleDbContextRegistration
{
    /// <summary>The history table that keeps one module's migrations apart from the other modules' in the same database.</summary>
    public static string HistoryTable(string moduleName) => $"__EFMigrationsHistory_{moduleName}";

    /// <summary>
    /// Registers a module DbContext against the current tenant's database (or the default database when no
    /// tenant was resolved), with its own migrations history table.
    /// </summary>
    public static IServiceCollection AddModuleDbContext<TContext>(this IServiceCollection services, string moduleName)
        where TContext : DbContext
    {
        services.AddDbContext<TContext>((serviceProvider, options) =>
        {
            var database = serviceProvider.GetRequiredService<ITenantDatabaseResolver>().Resolve();
            DatabaseProviders.Configure(options, database.Provider, database.ConnectionString, HistoryTable(moduleName));
        });
        return services;
    }
}
