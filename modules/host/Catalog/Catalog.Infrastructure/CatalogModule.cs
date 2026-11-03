using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Queries.GetCoreModules;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure;

public sealed class CatalogModule : IHostModule
{
    public string Name => SchemaNames.Catalog;

    public Assembly ApplicationAssembly => typeof(GetCoreModulesQuery).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<CatalogDbContext>(Name);
        services.AddModuleRepository<CatalogDbContext, ModuleRegistration>();
        services.AddScoped<IDbInitializer, CatalogDbInitializer>();

        // Module store: packages (host and client) kept on disk, see Packages/.
        services.AddSingleton(configuration.GetSection(ModuleStoreOptions.SectionName).Get<ModuleStoreOptions>() ?? new ModuleStoreOptions());
        services.AddSingleton<IModulePackageStore, FileModulePackageStore>();
        services.AddSingleton<IModuleRestart, ModuleRestart>();
    }
}
