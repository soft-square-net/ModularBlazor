using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.ModularBlazor.Client;
using soft.square.net.ModularBlazor.Client.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddSingleton(new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddSingleton(new ModuleOptions());
builder.Services.AddSingleton<ModuleManager>();
builder.Services.AddSingleton<ActiveModuleService>();
builder.Services.AddSingleton<IModuleNavigation>(sp => sp.GetRequiredService<ModuleManager>());
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<IAuthService>(sp => sp.GetRequiredService<AuthService>());

// The API is another origin than the page. ApiBaseUrl (wwwroot/appsettings.json) wins; otherwise the API port that
// matches the page's scheme (an https page may not call an http API: browsers block it as mixed content).
var apiBase = builder.Configuration["ApiBaseUrl"];
if (string.IsNullOrWhiteSpace(apiBase))
    apiBase = new Uri(builder.HostEnvironment.BaseAddress).Scheme == "https" ? "https://localhost:5101" : "http://localhost:5100";
builder.Services.AddScoped<IApiClient>(_ => new ApiClient(new HttpClient { BaseAddress = new Uri(apiBase) }));

var host = builder.Build();

// Phase 1: the main modules (layouts, login) are downloaded before the first render.
await host.Services.GetRequiredService<ModuleManager>().LoadStartupModulesAsync();

await host.RunAsync();
