using System.Reflection;
using Carter;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;
using soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure;
using soft.square.net.ModularBlazor.Infrastructure.Modules;

namespace soft.square.net.ModularBlazor.Host;

/// <summary>
/// The host modules that extend this API. To add one: create Domain/Application/Infrastructure projects under
/// modules/host/&lt;Name&gt;, reference its Infrastructure project from this project, implement IHostModule in it,
/// and add the module here. Every ICarterModule in the module's Infrastructure assembly is registered automatically.
/// </summary>
internal static class HostModules
{
    /// <summary>Folder of the module store (ModuleStore:Path). Set before <see cref="All"/> is first used.</summary>
    public static string StorePath { get; set; } = "assets/modules";

    private static IHostModule[]? _all;

    /// <summary>The built-in modules plus the host modules enabled in the module store and built into this app.</summary>
    public static IHostModule[] All => _all ??= BuiltIn()
        .Concat(ExternalHostModules.Load(StorePath, message => Console.WriteLine($"[module store] {message}")))
        .GroupBy(m => m.GetType())
        .Select(g => g.First())
        .ToArray();

    private static IHostModule[] BuiltIn() =>
    [
        new AuthModule(),
        new CatalogModule(),
        new MultitenancyModule(),
        new ElsaHostModule(),
        new TodoModule(),
        new MediaModule()
    ];

    public static Type[] CarterModuleTypes() => All
        .Select(m => m.GetType().Assembly)
        .Distinct()
        .SelectMany(a => a.GetTypes())
        .Where(t => t is { IsAbstract: false, IsInterface: false } && typeof(ICarterModule).IsAssignableFrom(t))
        .ToArray();
}
