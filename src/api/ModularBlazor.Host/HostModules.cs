using System.Reflection;
using Carter;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure;
using soft.square.net.ModularBlazor.Infrastructure.Modules;

namespace soft.square.net.ModularBlazor.Host;

/// <summary>
/// The host modules that extend this API. To add one: create Domain/Application/Infrastructure projects under
/// modules/host/&lt;Name&gt;, reference its Infrastructure project from this project, implement IHostModule in it,
/// and add the module here. Every ICarterModule in the module's Infrastructure assembly is registered automatically.
/// </summary>
internal static class HostModules
{
    public static readonly IHostModule[] All =
    [
        new AuthModule(),
        new CatalogModule()
    ];

    public static Type[] CarterModuleTypes() => All
        .Select(m => m.GetType().Assembly)
        .Distinct()
        .SelectMany(a => a.GetTypes())
        .Where(t => t is { IsAbstract: false, IsInterface: false } && typeof(ICarterModule).IsAssignableFrom(t))
        .ToArray();
}
