
using Finbuckle.MultiTenant;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Core.Tenancy;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

public static class MultiTenancyExtensions
{
    /// <summary>The request header that names the tenant, e.g. "X-Tenant: acme".</summary>
    public const string TenantHeader = "X-Tenant"; 

  /// <summary>
  /// Finbuckle multi-tenancy with an EF Core tenant store and one database per tenant.
  /// Configuration: ConnectionStrings:TenantStore and TenantStore:Provider (SqlServer | PostgreSql | MySql).
  /// </summary>
  public static IServiceCollection AddMultiTenancy(this IServiceCollection services, IConfiguration configuration)
    {
        var storeProvider = configuration.GetValue("TenantStore:Provider", DatabaseProvider.SqlServer);
        var storeConnection = configuration.GetConnectionString("TenantStore")
            ?? throw new InvalidOperationException("ConnectionStrings:TenantStore is not configured.");

        // The list of tenants.
        services.AddDbContext<TenantStoreDbContext>(options =>
            DatabaseProviders.Configure(options, storeProvider, storeConnection));

        services.AddMultiTenant<AppTenantInfo>()
            .WithHeaderStrategy(TenantHeader)
            .WithEFCoreStore<TenantStoreDbContext, AppTenantInfo>();

        // Where module DbContexts connect: the tenant's database, or this default one when no tenant was resolved.
        services.AddSingleton(new DatabaseConnection(storeProvider, storeConnection));
        services.AddScoped<TenantDatabaseResolver>();
        services.AddScoped<ITenantDatabaseResolver>(sp => sp.GetRequiredService<TenantDatabaseResolver>());
        services.AddScoped<ITenantDatabaseOverride>(sp => sp.GetRequiredService<TenantDatabaseResolver>());

        services.AddScoped<ITenantDatabaseInitializer, TenantDatabaseInitializer>();
        services.AddScoped<ITenantService, TenantService>();

        // The tenant's own data. Same rule as the module contexts: the resolved tenant's database, or the default one
        // when there is no tenant (also what `dotnet ef` sees when it builds the host to find the DbContexts).
        services.AddDbContext<AppDbContext>((serviceProvider, options) =>
        {
            var database = serviceProvider.GetRequiredService<ITenantDatabaseResolver>().Resolve();
            DatabaseProviders.Configure(options, database.Provider, database.ConnectionString,
                ModuleDbContextRegistration.HistoryTable("App"));
            options.AddSaveChangesInterceptors(serviceProvider);
        });

        return services;
    }
}
