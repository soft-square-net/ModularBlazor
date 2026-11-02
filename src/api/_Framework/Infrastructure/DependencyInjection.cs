using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.Identity;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers multi-tenancy and the cache. Host modules are added separately with AddHostModules.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, HttpContextCurrentUser>();
        services.AddPersistence();
        services.AddScoped<IDbInitializer, AppDbInitializer>();
        services.AddMultiTenancy(configuration);

        // Redis when ConnectionStrings:redis is set (the Aspire container), otherwise an in-memory cache.
        var redis = configuration.GetConnectionString("redis");
        if (!string.IsNullOrWhiteSpace(redis))
            services.AddStackExchangeRedisCache(options =>
            {
                options.Configuration = redis;
                options.InstanceName = "modularblazor:";
            });
        else
            services.AddDistributedMemoryCache();

        return services;
    }
}
