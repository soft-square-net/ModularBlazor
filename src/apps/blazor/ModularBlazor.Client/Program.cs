using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.ModularBlazor.Abstractions.Auth;
using soft.square.net.ModularBlazor.Client;
using soft.square.net.ModularBlazor.Client.Services;
using soft.square.net.ModularBlazor.Infrastructure.Auth;
using soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;
using System.Globalization;

const string ClientName = "ModularBlazor.API";

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Register Blazored LocalStorage service here!
builder.Services.AddBlazoredLocalStorage();


builder.Services.AddSingleton(new ModuleOptions());
builder.Services.AddSingleton<ModuleAssetStore>();
builder.Services.AddSingleton<IModulePackageReader, DllPackageReader>();
builder.Services.AddSingleton<IModulePackageReader, NuPkgPackageReader>();
builder.Services.AddSingleton<ModuleManager>();
builder.Services.AddSingleton<ActiveModuleService>();
builder.Services.AddSingleton<IModuleNavigation>(sp => sp.GetRequiredService<ModuleManager>());
// builder.Services.AddSingleton<AuthService>();
// builder.Services.AddSingleton<IAuthService>(sp => sp.GetRequiredService<AuthService>());

// The API is another origin than the page. ApiBaseUrl (wwwroot/appsettings.json) wins; otherwise the API port that
// matches the page's scheme (an https page may not call an http API: browsers block it as mixed content).
builder.Services.AddScoped<ICurrentUserService,CurrentUserService>();

var apiBase = builder.Configuration["ApiBaseUrl"];
if (string.IsNullOrWhiteSpace(apiBase))
    apiBase = new Uri(builder.HostEnvironment.BaseAddress).Scheme == "https" ? "https://localhost:5101" : "http://localhost:5100";
builder.Services.AddTransient<IApiClient, ApiClient>();
// builder.Services.AddSingleton(new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddKeyedSingleton<HttpClient>("LocalHttpClient", (sp, key) =>
{
  return new HttpClient
  {
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
  };
});
builder.Services.AddHttpClient(ClientName, client =>
{
  client.DefaultRequestHeaders.AcceptLanguage.Clear();
  client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(CultureInfo.DefaultThreadCurrentCulture?.TwoLetterISOLanguageName);
  client.BaseAddress = new Uri(builder.Configuration["ApiBaseUrl"]!);
})
         .AddHttpMessageHandler<JwtAuthenticationHeaderHandler>()
         .Services
         .AddScoped(sp => sp.GetRequiredService<IHttpClientFactory>().CreateClient(ClientName));


//////////////////////////////////////////////////
///               Auth Services
//////////////////////////////////////////////////
builder.Services.AddAuthentication(builder.Configuration);
//////////////////////////////////////////////////

var host = builder.Build();

// Phase 1: the main modules (layouts, login) are downloaded before the first render.
await host.Services.GetRequiredService<ModuleManager>().LoadStartupModulesAsync();

// ...and their styles/scripts go live (startup modules stay active for the whole session).
await host.Services.GetRequiredService<ActiveModuleService>().SyncAsync();

await host.RunAsync();
