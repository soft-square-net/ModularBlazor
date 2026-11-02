using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Base for a module's DbContext. Every IEntityTypeConfiguration in the module's assembly is applied
/// automatically (put them under Persistence/Configurations), then the BaseDbContext conventions.
/// Each module owns a schema named after it (<see cref="SchemaNames"/>): Auth.Users, Catalog.Modules, ... Name
/// tables plainly in the configurations. MySQL has no schemas, so there the schema name is prefixed to the
/// table names (Auth_Users) instead.
/// </summary>
public abstract class ModuleDbContext(DbContextOptions options) : BaseDbContext(options)
{
    /// <summary>The module's schema, one of <see cref="SchemaNames"/>.</summary>
    protected abstract string Schema { get; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly);
        base.OnModelCreating(modelBuilder);

        if (ModuleDbContextRegistration.SupportsSchemas(Database.ProviderName))
        {
            modelBuilder.HasDefaultSchema(Schema);
        }
        else
        {
            foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => e.BaseType is null))
            {
                var table = entity.GetTableName();
                if (table is not null) entity.SetTableName($"{Schema}_{table}");
            }
        }
    }
}

public static class ModuleDbContextRegistration
{
    /// <summary>MySQL (Oracle's provider) has no schemas.</summary>
    public static bool SupportsSchemas(string? providerName)
        => providerName is null || !providerName.Contains("MySql", StringComparison.OrdinalIgnoreCase);

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
            DatabaseProviders.Configure(options, database.Provider, database.ConnectionString, HistoryTable(moduleName), schema: moduleName);
            options.AddSaveChangesInterceptors(serviceProvider);
        });
        return services;
    }

    /// <summary>
    /// Registers a DbContext that always uses the default database (not per tenant): data that belongs to the
    /// platform itself, such as the tenant provisioning log.
    /// </summary>
    public static IServiceCollection AddControlPlaneDbContext<TContext>(this IServiceCollection services, string moduleName)
        where TContext : DbContext
    {
        services.AddDbContext<TContext>((serviceProvider, options) =>
        {
            var database = serviceProvider.GetRequiredService<DatabaseConnection>();
            DatabaseProviders.Configure(options, database.Provider, database.ConnectionString, HistoryTable(moduleName), schema: moduleName);
            options.AddSaveChangesInterceptors(serviceProvider);
        });
        return services;
    }
}
