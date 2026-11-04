using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Tenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

/// <summary>Creates and seeds the databases: the tenant store and platform data once, the business data per tenant.</summary>
public interface ITenantDatabaseInitializer
{
    /// <summary>Migrates the tenant store, ensures the root tenant, then initializes every tenant's database.</summary>
    Task InitializeAsync(CancellationToken cancellationToken = default);

    /// <summary>Migrates and seeds one tenant's database (every module's DbContext). Throws if one fails.</summary>
    Task InitializeTenantAsync(AppTenantInfo tenant, CancellationToken cancellationToken = default);
}

internal sealed class TenantDatabaseInitializer(
    TenantStoreDbContext store,
    IServiceScopeFactory scopeFactory,
    DatabaseConnection defaultDatabase,
    TimeProvider clock,
    ILogger<TenantDatabaseInitializer> logger) : ITenantDatabaseInitializer
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await store.Database.MigrateAsync(cancellationToken);
        await EnsureRootTenantAsync(cancellationToken);

        // Platform data (not per tenant), in the default database.
        using (var scope = scopeFactory.CreateScope())
        {
            foreach (var initializer in scope.ServiceProvider.GetServices<IDbInitializer>().Where(i => i is IControlPlaneDbInitializer))
                await RunAsync(initializer, "platform", cancellationToken);
        }

        var tenants = await store.Set<AppTenantInfo>().AsNoTracking().ToListAsync(cancellationToken);
        foreach (var tenant in tenants)
        {
            try
            {
                await InitializeTenantAsync(tenant, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Initializing the database of tenant '{Tenant}' failed. Have the migrations been generated (scripts/add-migration.*)?", tenant.Id);
            }
        }
    }

    public async Task InitializeTenantAsync(AppTenantInfo tenant, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.ConnectionString))
            throw new InvalidOperationException($"Tenant '{tenant.Id}' has no connection string.");

        using var scope = scopeFactory.CreateScope();
        scope.ServiceProvider.GetRequiredService<ITenantDatabaseOverride>()
            .Use(new DatabaseConnection(tenant.Provider, tenant.ConnectionString), tenant.Id);

        foreach (var initializer in scope.ServiceProvider.GetServices<IDbInitializer>().Where(i => i is not IControlPlaneDbInitializer))
            await initializer.InitializeAsync(cancellationToken);
    }

    private async Task RunAsync(IDbInitializer initializer, string what, CancellationToken cancellationToken)
    {
        try
        {
            await initializer.InitializeAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "{Initializer} ({What}) failed. Have the migrations been generated (scripts/add-migration.*)?",
                initializer.GetType().Name, what);
        }
    }

    /// <summary>The root tenant owns the default database and cannot be deactivated.</summary>
    private async Task EnsureRootTenantAsync(CancellationToken cancellationToken)
    {
        var tenants = store.Set<AppTenantInfo>();
        if (await tenants.AnyAsync(t => t.Id == ITenantService.RootTenantId, cancellationToken))
            return;

        tenants.Add(new AppTenantInfo
        {
            Id = ITenantService.RootTenantId,
            Identifier = ITenantService.RootTenantId,
            Name = "Root",
            AdminEmail = "admin@root.com",
            Provider = defaultDatabase.Provider,
            ConnectionString = defaultDatabase.ConnectionString,
            IsActive = true,
            ValidUpto = clock.GetUtcNow().UtcDateTime.AddYears(100)
        });
        await store.SaveChangesAsync(cancellationToken);
    }
}
