using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Core.ClientModules;

/// <summary>
/// Core module "client-modules" (ships with every WebApi release): the catalog of the Blazor WebAssembly client's
/// modules, the client-side counterpart of the host's runtime module catalog.
/// <list type="bullet">
/// <item>Admins (<c>platform.modules.manage</c>) upload a .dll, .nupkg or .zip; it is read as metadata (nothing runs on
/// the server), shown as a draft, then installed with its settings: who gets it (roles, tenants), when it loads
/// (startup, lazy, preload), its routes, layout, dependencies and menu entries. Versions are kept for rollback.</item>
/// <item>The client app asks for its manifest (<c>GET /api/client-modules/manifest</c>, anonymous or signed in) and
/// downloads the files it lists from this module; both answer only with what the caller may use.</item>
/// <item>On activation it seeds the client modules shipped with the release (CoreClientModules folder).</item>
/// </list>
/// </summary>
public sealed class ClientModulesModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("client-modules", "Client modules", "1.0.0", "client-modules")
    {
        Description = "Core module: catalog of the Blazor client's modules (upload, settings, versions) and the per-user client manifest.",
        DefaultSettings = new Dictionary<string, string?>
        {
            ["ClientModules:Path"] = "App_Data/client-modules",
            ["ClientModules:SeedPath"] = "CoreClientModules",
            ["ClientModules:MaxPackageMegabytes"] = "50"
        }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<ClientModulesOptions>(settings.GetSection("ClientModules"));
        services.AddSingleton<ClientModuleCatalog>();
        services.AddSingleton<IModuleActivation, ClientModuleSeeder>();
    }
}

public sealed class ClientModulesOptions
{
    /// <summary>Catalog folder (records, files, uploads), relative to the content root. Shared by every replica.</summary>
    public string Path { get; set; } = "App_Data/client-modules";

    /// <summary>Client modules shipped with the WebApi release, relative to the app base directory.</summary>
    public string SeedPath { get; set; } = "CoreClientModules";

    public int MaxPackageMegabytes { get; set; } = 50;
}

/// <summary>Seeds the shipped client modules on activation; idempotent, runs on every replica that loads the module.</summary>
internal sealed class ClientModuleSeeder(ClientModuleCatalog catalog, ILogger<ClientModuleSeeder> log) : IModuleActivation
{
    public async Task ActivatedAsync(CancellationToken ct)
    {
        try
        {
            await catalog.SeedAsync(ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // The catalog keeps working with what it has; the admin sees the shipped modules missing.
            log.LogError(e, "Seeding the core client modules failed");
        }
    }
}
