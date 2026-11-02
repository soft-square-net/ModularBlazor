using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure;

/// <summary>Tenant management API. The tenant store and tenant service themselves live in the framework Infrastructure.</summary>
public sealed class MultitenancyModule : IHostModule
{
    public string Name => "Multitenancy";

    public Assembly ApplicationAssembly => typeof(TenantProvisioningRunner).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddControlPlaneDbContext<MultitenancyDbContext>(Name);
        services.AddModuleRepository<MultitenancyDbContext, TenantProvisioning>();
        services.AddScoped<IDbInitializer, MultitenancyDbInitializer>();
        services.AddScoped<TenantProvisioningRunner>();
    }
}
