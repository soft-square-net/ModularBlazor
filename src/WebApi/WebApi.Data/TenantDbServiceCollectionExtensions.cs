using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

public static class TenantDbServiceCollectionExtensions
{
    /// <summary>
    /// Registers a module's <see cref="TenantDbContext"/> (call it in <c>IRuntimeModule.ConfigureServices</c>):
    /// <list type="bullet">
    /// <item>scoped, connected to the database of the scope's tenant (<see cref="ITenantContext"/>);</item>
    /// <item>on the module's own EF Core internal service provider, so EF's model and query caches, which are keyed by the
    /// module's types, live and die with the module and never pin its load context in EF's process-wide cache;</item>
    /// <item>migrated for every active tenant when the module loads and when a tenant is added (<see cref="ITenantInitializer"/>),
    /// once at a time behind an advisory lock. Migrations live in the module assembly.</item>
    /// </list>
    /// </summary>
    public static IServiceCollection AddTenantDbContext<TContext>(this IServiceCollection services) where TContext : TenantDbContext
    {
        services.TryAddSingleton<TenantEfServices>();
        services.AddDbContext<TContext>((sp, options) =>
        {
            var tenant = sp.GetRequiredService<ITenantContext>().Required;
            options.UseNpgsql(sp.GetRequiredService<TenantDatabases>().ConnectionString(tenant));
            options.UseInternalServiceProvider(sp.GetRequiredService<TenantEfServices>().Provider);
        });
        services.AddSingleton<ITenantInitializer, TenantMigrationInitializer<TContext>>();
        return services;
    }
}

/// <summary>
/// The EF Core internal service provider of one module (a singleton of the module's container, disposed on unload).
/// EF otherwise keeps one internal provider per options shape in a static cache, and that provider's model cache is
/// keyed by the DbContext type: it would keep every module that ever used EF from unloading.
/// </summary>
public sealed class TenantEfServices : IDisposable
{
    private readonly ServiceProvider _provider;

    public TenantEfServices(ILoggerFactory loggerFactory)
    {
        var services = new ServiceCollection().AddEntityFrameworkNpgsql();
        services.AddSingleton(loggerFactory); // the host's; an instance is never disposed by this provider
        _provider = services.BuildServiceProvider();
    }

    public IServiceProvider Provider => _provider;

    public void Dispose() => _provider.Dispose();
}

/// <summary>Applies the module's migrations to one tenant's database, inside the module's schema.</summary>
internal sealed class TenantMigrationInitializer<TContext>(IServiceProvider services, TenantDatabases databases, ILogger<TenantMigrationInitializer<TContext>> log)
    : ITenantInitializer where TContext : TenantDbContext
{
    public async Task InitializeAsync(TenantInfo tenant, CancellationToken ct)
    {
        await using var scope = services.CreateTenantScope(tenant);
        var db = scope.ServiceProvider.GetRequiredService<TContext>();

        await using (await databases.LockAsync(tenant, $"migrate:{typeof(TContext).FullName}", ct))
        {
            var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToArray();
            if (pending.Length == 0) return;
            await db.Database.MigrateAsync(ct);
            log.LogInformation("Migrated {Context} for tenant {Tenant}: {Migrations}", typeof(TContext).Name, tenant.Id, string.Join(", ", pending));
        }
    }
}

/// <summary>
/// Design-time support for <c>dotnet ef migrations add</c> in a module project: a fixed tenant and a local connection
/// string (only used to build the model; adding a migration does not connect).
/// </summary>
public static class TenantDbDesignTime
{
    public static DbContextOptions<TContext> Options<TContext>(string connectionString = "Host=localhost;Database=design_time")
        where TContext : DbContext =>
        new DbContextOptionsBuilder<TContext>().UseNpgsql(connectionString).Options;

    public static ITenantContext Tenant { get; } = new DesignTimeTenant();

    private sealed class DesignTimeTenant : ITenantContext
    {
        public TenantInfo? Tenant { get; } = new("design-time", "Design time", TenantStatus.Active, [], "design-time", "design_time");
        public string? ResolvedBy => "design-time";
    }
}
