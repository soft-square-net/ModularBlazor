using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

public static partial class TenantDbServiceCollectionExtensions
{
    /// <summary>
    /// Registers a module's <see cref="TenantDbContext"/> (call it in <c>IRuntimeModule.ConfigureServices</c>):
    /// <list type="bullet">
    /// <item>scoped, connected to the database of the scope's tenant (<see cref="ITenantContext"/>);</item>
    /// <item>on the module's own EF Core internal service provider, so EF's model and query caches, which are keyed by the
    /// module's types, live and die with the module and never pin its load context in EF's process-wide cache;</item>
    /// <item>migrated for every active tenant when the module loads and when a tenant is added (<see cref="ITenantInitializer"/>),
    /// once at a time behind an advisory lock. Migrations live in the module assembly.</item>
    /// <item>the default <see cref="SharedKernel.IRepository{T}"/> and <see cref="SharedKernel.IReadRepository{T}"/> for the
    /// module's aggregates (<see cref="EfRepository{T}"/>), on the first DbContext a module registers.</item>
    /// </list>
    /// </summary>
    public static IServiceCollection AddTenantDbContext<TContext>(this IServiceCollection services) where TContext : TenantDbContext
    {
        services.TryAddSingleton<TenantEfServices>();
        services.AddDbContext<TContext>((sp, options) =>
        {
            // The tenant's server decides the engine; each engine has its own internal provider (and model cache).
            var tenant = sp.GetRequiredService<ITenantContext>().Required;
            var databases = sp.GetRequiredService<TenantDatabases>();
            var server = databases.ServerOf(tenant);
            server.Adapter.Use(options, databases.ConnectionString(tenant), tenant.DatabaseName);
            options.UseInternalServiceProvider(sp.GetRequiredService<TenantEfServices>().For(server.Provider));
        });
        services.AddSingleton<ITenantInitializer, TenantMigrationInitializer<TContext>>();

        // Default repositories: open generics in the module's container, over its first DbContext.
        services.TryAddScoped<DbContext>(sp => sp.GetRequiredService<TContext>());
        services.TryAddScoped(typeof(SharedKernel.IRepository<>), typeof(EfRepository<>));
        services.TryAddScoped(typeof(SharedKernel.IReadRepository<>), typeof(EfRepository<>));
        return services;
    }
}

/// <summary>
/// The EF Core internal service providers of one module, one per engine it is used with (a singleton of the module's
/// container, disposed on unload). EF otherwise keeps one internal provider per options shape in a static cache, and
/// that provider's model cache is keyed by the DbContext type: it would keep every module that ever used EF from
/// unloading. Each provider also selects the engine's migration set (<see cref="ProviderMigrationsAssembly"/>).
/// </summary>
public sealed class TenantEfServices(ILoggerFactory loggerFactory) : IDisposable
{
    private readonly Dictionary<DatabaseProvider, ServiceProvider> _providers = [];
    private bool _disposed;

    public IServiceProvider For(DatabaseProvider provider)
    {
        lock (_providers)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_providers.TryGetValue(provider, out var existing)) return existing;
            var services = DatabaseProviderAdapter.For(provider).AddEntityFramework(new ServiceCollection());
            services.Replace(ServiceDescriptor.Scoped<IMigrationsAssembly, ProviderMigrationsAssembly>());
            services.AddSingleton(loggerFactory); // the host's; an instance is never disposed by this provider
            return _providers[provider] = services.BuildServiceProvider();
        }
    }

    public void Dispose()
    {
        lock (_providers)
        {
            _disposed = true;
            foreach (var provider in _providers.Values) provider.Dispose();
            _providers.Clear();
        }
    }
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
/// string (only used to build the model; adding a migration does not connect). The engine comes from the arguments
/// after <c>--</c>: <c>-- --provider SqlServer</c> (PostgreSql by default). Each engine's migrations go to
/// <c>Migrations/&lt;Provider&gt;</c> with the namespace <c>….Migrations.&lt;Provider&gt;</c>, for example:
/// <code>dotnet ef migrations add Initial --output-dir Migrations/SqlServer --namespace My.Module.Migrations.SqlServer -- --provider SqlServer</code>
/// </summary>
public static class TenantDbDesignTime
{
    public static DbContextOptions<TContext> Options<TContext>(string[] args) where TContext : DbContext =>
        Builder<TContext>(ProviderFrom(args)).Options;

    public static DbContextOptionsBuilder<TContext> Builder<TContext>(DatabaseProvider provider) where TContext : DbContext
    {
        var options = new DbContextOptionsBuilder<TContext>();
        DatabaseProviderAdapter.For(provider).Use(options, DesignTimeConnection(provider), "design_time");
        options.ReplaceService<IMigrationsAssembly, ProviderMigrationsAssembly>();
        return options;
    }

    public static DatabaseProvider ProviderFrom(string[] args)
    {
        var index = Array.FindIndex(args, a => a is "--provider" or "-p");
        if (index < 0 || index + 1 >= args.Length) return DatabaseProvider.PostgreSql;
        return Enum.Parse<DatabaseProvider>(args[index + 1], ignoreCase: true);
    }

    private static string DesignTimeConnection(DatabaseProvider provider) => provider switch
    {
        DatabaseProvider.SqlServer => "Server=localhost;Database=design_time;TrustServerCertificate=true",
        DatabaseProvider.MySql => "Server=localhost;Database=design_time;User ID=design;Password=design",
        DatabaseProvider.Oracle => "User Id=design;Password=design;Data Source=localhost:1521/FREEPDB1",
        _ => "Host=localhost;Database=design_time"
    };

    public static ITenantContext Tenant { get; } = new DesignTimeTenant();

    private sealed class DesignTimeTenant : ITenantContext
    {
        public TenantInfo? Tenant { get; } = new("design-time", "Design time", TenantStatus.Active, [], "design-time", "design_time");
        public string? ResolvedBy => "design-time";
    }
}
