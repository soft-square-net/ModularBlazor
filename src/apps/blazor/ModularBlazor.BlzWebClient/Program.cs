using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using soft.square.net.ModularBlazor.BlzWebClient;
using soft.square.net.ModularBlazor.BlzWebClient.Auth;
using soft.square.net.ModularBlazor.BlzWebClient.Services;
using soft.square.net.ModularBlazor.Abstractions.MudTail;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Two kinds of HttpClient, on purpose:
//   * "LocalHttpClient" (this site's own origin): app files; modules come from the WebApi, not from this site.
//   * "WebApi" (the YARP gateway in front of every WebApi pool): carries the OpenIddict access token;
//     "WebApi.Public" is the same gateway without a token (the anonymous client manifest and public module files).
builder.Services.AddKeyedSingleton<HttpClient>("LocalHttpClient", (_, _) => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
});

// Sign-in: OpenID Connect against the OpenIddict identity service (wwwroot/appsettings.json "Oidc").
builder.Services.AddOpenIddictAuthentication(builder.Configuration);

// The gateway (wwwroot/appsettings.json "WebApi:BaseUrl"): every call gets the user's access token.
var gateway = builder.Configuration["WebApi:BaseUrl"];
if (string.IsNullOrWhiteSpace(gateway)) gateway = "http://localhost:5080/";
builder.Services.AddWebApiClient(gateway);
builder.Services.AddScoped<HostModulesApi>();

// MudTail's runtime, shared through the Layouts.Default module (tables, toasts, behaviours on this app's pages).
builder.Services.AddScoped<MudTailRuntime>();

// Modules. ModuleManager and ActiveModuleService follow the user's session (AuthenticationStateProvider is scoped),
// so they are scoped too; WebAssembly has one scope for the whole app, so they still live as long as the page.
builder.Services.AddSingleton(new ModuleOptions());
builder.Services.AddSingleton<ModuleAssetStore>();
builder.Services.AddSingleton<ModuleCache>();
builder.Services.AddSingleton<IModulePackageReader, DllPackageReader>();
builder.Services.AddSingleton<IModulePackageReader, NuPkgPackageReader>();
builder.Services.AddScoped<ModuleManager>();
builder.Services.AddScoped<ActiveModuleService>();
builder.Services.AddScoped<soft.square.net.ModularBlazor.Abstractions.IModuleNavigation>(sp => sp.GetRequiredService<ModuleManager>());

var host = builder.Build();

// host.Services is the app's scope (the one components resolve from), so these are the instances the UI sees.
var modules = host.Services.GetRequiredService<ModuleManager>();

// Phase 1: the client manifest from the WebApi (api/client-modules/manifest; the last anonymous one this browser
// received when it cannot be reached), then the startup modules (layouts, MudTail theme) before the first render. A returning
// user's OIDC session is still in the browser, so their manifest is the one fetched and their modules are known before
// the first route.
await modules.LoadStartupModulesAsync();

// ...and the startup modules' styles/scripts go live (they stay active for the whole session).
await host.Services.GetRequiredService<ActiveModuleService>().SyncAsync();

await host.RunAsync();
