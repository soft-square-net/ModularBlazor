using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using ModularBlazor.Abstractions;
using ModularBlazor.Client;
using ModularBlazor.Client.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddSingleton(new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddSingleton(new ModuleOptions());
builder.Services.AddSingleton<ModuleManager>();
builder.Services.AddSingleton<IModuleNavigation>(sp => sp.GetRequiredService<ModuleManager>());
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<IAuthService>(sp => sp.GetRequiredService<AuthService>());

var host = builder.Build();

// Phase 1: the main modules (layouts, login) are downloaded before the first render.
await host.Services.GetRequiredService<ModuleManager>().LoadStartupModulesAsync();

await host.RunAsync();
