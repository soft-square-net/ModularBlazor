using Microsoft.EntityFrameworkCore;
using soft.square.net.Share.All;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence;

/// <summary>Seeds the module list the demo client ships with (the files built by build-modules.sh).</summary>
public sealed class CatalogDbInitializer(CatalogDbContext dbContext) : DbInitializer<CatalogDbContext>(dbContext)
{
    protected override async Task SeedAsync(CatalogDbContext db, CancellationToken cancellationToken)
    {
        if (await db.Modules.AnyAsync(cancellationToken))
            return;

        db.Modules.AddRange(
            new ModuleRegistration("Layouts.Default", "Default layout", "1.0.0", ModuleKind.Dll,
                "modules/soft.square.net.Layouts.Default.dll")
            { LoadOnStartup = true, Hidden = true, SortOrder = 1 },

            new ModuleRegistration("Module.Auth", "Authentication (login page + auth layout)", "1.0.0", ModuleKind.Dll,
                "modules/soft.square.net.Module.Auth.dll")
            { LoadOnStartup = true, Hidden = true, RoutePrefixes = ["login"], Layout = "auth", SortOrder = 2 },

            new ModuleRegistration("Module.Dashboard", "Dashboard", "1.0.0", ModuleKind.Dll,
                "modules/soft.square.net.Module.Dashboard.dll")
            {
                RequiresAuth = true, RoutePrefixes = ["dashboard"], Layout = "default",
                Nav = [new ModuleNavItem("Dashboard", "dashboard", 10)], SortOrder = 10
            },

            new ModuleRegistration("Module.Reports", "Reports", "1.0.0", ModuleKind.NuPkg,
                "modules/soft.square.net.Module.Reports.1.0.0.nupkg")
            {
                RequiresAuth = true, RoutePrefixes = ["reports"], Layout = "default", Styles = ["reports.css"],
                Nav = [new ModuleNavItem("Reports", "reports", 20)], SortOrder = 20
            },

            new ModuleRegistration("Layouts.Admin", "Admin layout", "1.0.0", ModuleKind.Dll,
                "modules/soft.square.net.Layouts.Admin.dll")
            { Hidden = true, AvailableToRoles = ["admin"], SortOrder = 30 },

            new ModuleRegistration("Module.Admin", "Administration", "1.0.0", ModuleKind.Dll,
                "modules/soft.square.net.Module.Admin.dll")
            {
                RequiresAuth = true, RequiredRole = "admin", AvailableToRoles = ["admin"], RoutePrefixes = ["admin"],
                Layout = "admin", Dependencies = ["Layouts.Admin"],
                Nav = [new ModuleNavItem("Administration", "admin", 90)], SortOrder = 40
            });

        await db.SaveChangesAsync(cancellationToken);
    }
}
