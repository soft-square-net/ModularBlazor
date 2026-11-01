using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Infrastructure;

/// <summary>
/// In-memory module catalog. Replace with a database or configuration-backed implementation.
/// Urls are relative to the Blazor client's base address.
/// </summary>
public sealed class InMemoryModuleCatalog : IModuleCatalog
{
    private static readonly ModuleDescriptor Dashboard = new()
    {
        Id = "Module.Dashboard", Name = "Dashboard", Version = "1.0.0", Kind = ModuleKind.Dll,
        Url = "modules/soft.square.net.Module.Dashboard.dll", RequiresAuth = true, RoutePrefixes = ["dashboard"], Layout = "default",
        Nav = [new ModuleNavItem("Dashboard", "dashboard", 10)]
    };

    private static readonly ModuleDescriptor Reports = new()
    {
        Id = "Module.Reports", Name = "Reports", Version = "1.0.0", Kind = ModuleKind.NuPkg,
        Url = "modules/soft.square.net.Module.Reports.1.0.0.nupkg", RequiresAuth = true, RoutePrefixes = ["reports"],
        Layout = "default", Styles = ["reports.css"],
        Nav = [new ModuleNavItem("Reports", "reports", 20)]
    };

    private static readonly ModuleDescriptor AdminLayout = new()
    {
        Id = "Layouts.Admin", Name = "Admin layout", Version = "1.0.0", Kind = ModuleKind.Dll,
        Url = "modules/soft.square.net.Layouts.Admin.dll", Hidden = true
    };

    private static readonly ModuleDescriptor Admin = new()
    {
        Id = "Module.Admin", Name = "Administration", Version = "1.0.0", Kind = ModuleKind.Dll,
        Url = "modules/soft.square.net.Module.Admin.dll", RequiresAuth = true, RequiredRole = "admin", RoutePrefixes = ["admin"],
        Layout = "admin", Dependencies = ["Layouts.Admin"],
        Nav = [new ModuleNavItem("Administration", "admin", 90)]
    };

    public ModuleManifest GetCoreModules() => new()
    {
        Modules =
        [
            new ModuleDescriptor
            {
                Id = "Layouts.Default", Name = "Default layout", Version = "1.0.0", Kind = ModuleKind.Dll,
                Url = "modules/soft.square.net.Layouts.Default.dll", LoadOnStartup = true, Hidden = true
            },
            new ModuleDescriptor
            {
                Id = "Module.Auth", Name = "Authentication (login page + auth layout)", Version = "1.0.0",
                Kind = ModuleKind.Dll, Url = "modules/soft.square.net.Module.Auth.dll", LoadOnStartup = true, Hidden = true,
                RoutePrefixes = ["login"], Layout = "auth"
            }
        ]
    };

    public ModuleManifest GetModulesForRole(string role) => new()
    {
        Modules = string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase)
            ? [Dashboard, Reports, AdminLayout, Admin]
            : [Dashboard, Reports]
    };
}
