using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace soft.square.net.WebApi.Modularity;

public static class RuntimeModulesExtensions
{
    /// <summary>Registers the runtime module system. Call after the host's own services are registered.</summary>
    public static IServiceCollection AddRuntimeModules(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ModuleRuntimeOptions>(configuration.GetSection("Modules"));
        services.AddSingleton(new HostServices(services));
        services.AddSingleton<ModuleEndpointDataSource>();
        // Lets the API explorer (OpenAPI) refresh when modules come and go.
        services.AddSingleton<IActionDescriptorChangeProvider>(sp => sp.GetRequiredService<ModuleEndpointDataSource>());
        services.AddSingleton<ModuleRuntime>();
        services.AddHostedService<ModuleReconciler>();
        return services;
    }

    /// <summary>Adds the endpoints of runtime-activated modules to the route table.</summary>
    public static IEndpointRouteBuilder MapRuntimeModules(this IEndpointRouteBuilder app)
    {
        app.DataSources.Add(app.ServiceProvider.GetRequiredService<ModuleEndpointDataSource>());

        // The DI-level EndpointDataSource (read by ApiExplorer/OpenAPI) only follows data source changes once
        // someone has asked it for a change token; otherwise it keeps the endpoint list from its first read —
        // stale OpenAPI after a module is removed, and a reference that stops the module from unloading.
        app.ServiceProvider.GetRequiredService<EndpointDataSource>().GetChangeToken();
        return app;
    }

    private sealed class ModuleReconciler(ModuleRuntime runtime) : IHostedService
    {
        public Task StartAsync(CancellationToken cancellationToken) => runtime.ReconcileAsync(cancellationToken);
        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
