using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using soft.square.net.ModularBlazor.Client;
using soft.square.net.ModularBlazor.Client.Services;
using soft.square.net.ModularBlazor.Infrastructure.Auth;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Two kinds of HttpClient, on purpose:
//   * "LocalHttpClient" (this site's own origin): the module files in wwwroot/modules and the offline fallback manifest.
//   * the API clients (AddApiClients): the Catalog manifests, sign-in, everything under /api. They never go to this origin.
// (An unkeyed HttpClient is the framework default: this site's origin. Nothing overrides it any more.)
builder.Services.AddKeyedSingleton<HttpClient>("LocalHttpClient", (_, _) => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
});

// The API is another origin than the page. ApiBaseUrl (wwwroot/appsettings.json) wins; otherwise the API port that
// matches the page's scheme (an https page may not call an http API: browsers block it as mixed content).
var apiBase = builder.Configuration["ApiBaseUrl"];
if (string.IsNullOrWhiteSpace(apiBase))
    apiBase = new Uri(builder.HostEnvironment.BaseAddress).Scheme == "https" ? "https://localhost:5101" : "http://localhost:5100";
builder.Services.AddApiClients(apiBase);

// Sign-in state (JWT in local storage), current user, permission policies.
builder.Services.AddAuthentication(builder.Configuration);

// Modules.
builder.Services.AddSingleton(new ModuleOptions());
builder.Services.AddSingleton<ModuleAssetStore>();
builder.Services.AddSingleton<ModuleCache>();
builder.Services.AddSingleton<IModulePackageReader, DllPackageReader>();
builder.Services.AddSingleton<IModulePackageReader, NuPkgPackageReader>();
builder.Services.AddSingleton<ModuleManager>();
builder.Services.AddSingleton<ActiveModuleService>();
builder.Services.AddSingleton<soft.square.net.ModularBlazor.Abstractions.IModuleNavigation>(sp => sp.GetRequiredService<ModuleManager>());

var host = builder.Build();

var modules = host.Services.GetRequiredService<ModuleManager>();

// Phase 1: the core modules (layouts, login) come from the API's Catalog and are downloaded before the first render.
await modules.LoadStartupModulesAsync();

// Phase 2 for a returning user: the token is still in local storage, so their modules are known before the first route.
await modules.RestoreUserModulesAsync();

// ...and the startup modules' styles/scripts go live (they stay active for the whole session).
await host.Services.GetRequiredService<ActiveModuleService>().SyncAsync();

await host.RunAsync();
