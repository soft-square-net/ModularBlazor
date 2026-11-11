using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.Tenancy;

public static class TenancyHostExtensions
{
    /// <summary>Connection string of the tenant store (registry of tenants).</summary>
    public const string StoreConnectionName = "TenantStore";

    /// <summary>
    /// Host-level tenancy, on every replica of every pool: the tenant directory (tenant store, cached, refreshed over
    /// the broker <paramref name="brokerConnectionName"/>), <see cref="ITenantContext"/> for every request and tenant
    /// scope, tenant database connections, and per-tenant initialization of runtime modules. Register before the
    /// runtime modules so the directory loads before they activate.
    /// </summary>
    public static IHostApplicationBuilder AddPlatformTenancy(this IHostApplicationBuilder builder, string brokerConnectionName)
    {
        var services = builder.Services;
        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
        services.AddScoped<ITenantScopeInitializer>(sp => sp.GetRequiredService<TenantContext>());

        services.AddSingleton<TenantDirectory>();
        services.AddSingleton<ITenantDirectory>(sp => sp.GetRequiredService<TenantDirectory>());
        services.AddHostedService<TenantDirectoryService>();
        services.AddSingleton<TenantDatabases>();

        services.AddSingleton<ModuleTenantInitializer>();
        services.AddSingleton<IModuleLifecycleObserver>(sp => sp.GetRequiredService<ModuleTenantInitializer>());

        var store = builder.Configuration.GetConnectionString(StoreConnectionName);
        if (!string.IsNullOrWhiteSpace(store))
        {
            services.AddDbContext<TenantStoreDbContext>(options => TenantStoreDbContext.Configure(options, store));
            services.AddScoped<TenantRegistry>();
        }

        services.TryAddSingleton<ITenantChangeBus, NullTenantChangeBus>();
        if (!string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString(brokerConnectionName)))
        {
            // The RabbitMQ client itself is registered by AddRuntimeModuleBroadcast (same connection name).
            services.Replace(ServiceDescriptor.Singleton<ITenantChangeBus, RabbitMqTenantChangeBus>());
            services.AddHostedService<TenantChangeSubscriber>();
        }
        return builder;
    }

    /// <summary>Resolves the tenant of every request (after routing, so it can read the endpoint's metadata).</summary>
    public static IApplicationBuilder UseTenancy(this IApplicationBuilder app) => app.UseMiddleware<TenantResolutionMiddleware>();
}
