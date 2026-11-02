using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

namespace soft.square.net.ModularBlazor.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers multi-tenancy and the cache. Host modules are added separately with AddHostModules.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
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
