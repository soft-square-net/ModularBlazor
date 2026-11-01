using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ModularBlazor.Core;
using ModularBlazor.Infrastructure.Persistence;

namespace ModularBlazor.Infrastructure.MultiTenancy;

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

        // The tenant's own data: provider and connection string come from the resolved tenant.
        services.AddDbContext<AppDbContext>((serviceProvider, options) =>
        {
            var tenant = serviceProvider.GetRequiredService<IMultiTenantContextAccessor<AppTenantInfo>>()
                .MultiTenantContext?.TenantInfo
                ?? throw new InvalidOperationException("No tenant was resolved for this request. Send the X-Tenant header.");

            if (string.IsNullOrWhiteSpace(tenant.ConnectionString))
                throw new InvalidOperationException($"Tenant '{tenant.Identifier}' has no connection string.");

            DatabaseProviders.Configure(options, tenant.Provider, tenant.ConnectionString);
        });

        return services;
    }
}
