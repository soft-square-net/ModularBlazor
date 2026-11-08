using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application;

internal static class ModuleManifestMapping
{
    public static ModuleManifest ToManifest(this IEnumerable<ModuleRegistration> modules)
        => new() { Modules = modules.Select(ToDescriptor).ToList() };

    private static ModuleDescriptor ToDescriptor(ModuleRegistration m) => new()
    {
        Id = m.Id,
        Name = m.Name,
        Version = m.Version,
        Kind = m.Kind,
        Url = m.Url,
        Sha256 = m.Sha256,
        LoadOnStartup = m.LoadOnStartup,
        Hidden = m.Hidden,
        RequiresAuth = m.RequiresAuth,
        RequiredRole = m.RequiredRole,
        RoutePrefixes = m.RoutePrefixes,
        Layout = m.Layout,
        Dependencies = m.Dependencies,
        ExtraAssemblies = m.ExtraAssemblies,
        Styles = m.Styles,
        Scripts = m.Scripts,
        Nav = m.Nav
    };
}
