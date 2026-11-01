using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ModularBlazor.Core;
using ModularBlazor.Infrastructure.MultiTenancy;

namespace ModularBlazor.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers every Core contract with its Infrastructure implementation, plus multi-tenancy.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IModuleCatalog, InMemoryModuleCatalog>();
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
