using System.Reflection;
using Carter;
using ModularBlazor.Host.Modules.Auth;
using ModularBlazor.Host.Modules.Catalog;

namespace ModularBlazor.Host;

/// <summary>
/// The host modules that extend this API. To add one: create a project under modules/host, reference it
/// from this project, and list its assembly here. Every ICarterModule inside it is registered automatically.
/// </summary>
internal static class HostModules
{
    private static readonly Assembly[] Assemblies =
    [
        AuthModuleInfo.Assembly,
        CatalogModuleInfo.Assembly
    ];

    public static Type[] CarterModuleTypes() => Assemblies
        .SelectMany(a => a.GetTypes())
        .Where(t => t is { IsAbstract: false, IsInterface: false } && typeof(ICarterModule).IsAssignableFrom(t))
        .ToArray();
}
