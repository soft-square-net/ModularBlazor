using System.Net.Http.Headers;
using soft.square.net.WebApi.Client;
using soft.square.net.WebApi.Modules.Greeting.Client;

// args: baseUrl token zipPath
var http = new HttpClient { BaseAddress = new Uri(args[0]) };
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", args[1]);
var modules = new ModulesClient(http);
var failures = 0;
void Check(bool ok, string what) { Console.WriteLine($"{(ok ? "PASS" : "FAIL")} {what}"); if (!ok) failures++; }

await new HealthClient(http).GetAsync();
Check(true, "Health.GetAsync");
var pool = await new PoolClient(http).GetAsync();
Check(pool.Pool == "all" && pool.EnabledModules?.Contains("*") == true, $"Pool.GetAsync pool={pool.Pool} role={pool.Role}");

await using (var zip = File.OpenRead(args[2]))
{
    var record = await modules.InstallAsync(new FileParameter(zip, "greeting.zip", "application/zip"));
    Check(record.Id == "greeting" && record.DesiredState == ModuleState.Installed, $"InstallAsync id={record.Id} state={record.DesiredState}");
}
var active = await modules.ActivateAsync("greeting");
Check(active.Loaded == true && active.Module?.DesiredState == ModuleState.Active && active.Routes?.Count > 0, $"ActivateAsync routes={string.Join(", ", active.Routes ?? [])}");

var greeting = new GreetingClient(http);
var hello = await greeting.GreetAsync("john_doe");
Check(hello.Message?.Contains("John Doe") == true, $"GreetingClient.GreetAsync -> {hello.Message}");
var echo = await greeting.EchoAsync(new EchoRequest { Text = "hello world" });
Check(echo.Text == "HelloWorld", $"GreetingClient.EchoAsync -> {echo.Text}");

var settings = await modules.UpdateSettingsAsync("greeting", new Dictionary<string, string> { ["Greeting:Prefix"] = "Howdy" });
Check(settings.Settings?["Greeting:Prefix"] == "Howdy", "UpdateSettingsAsync");

var list = await modules.ListAsync();
Check(list.Any(s => s.Module?.Id == "greeting"), $"ListAsync count={list.Count}");

var inactive = await modules.DeactivateAsync("greeting");
Check(inactive.Module?.DesiredState == ModuleState.Inactive, "DeactivateAsync");
var unloaded = await modules.UnloadAsync("greeting");
Check(unloaded.Id == "greeting", $"UnloadAsync unloaded={unloaded.Unloaded} gc={unloaded.GcPasses}");
var pending = await modules.ListUnloadingAsync();
Check(pending is not null, $"ListUnloadingAsync count={pending.Count}");

try { await modules.ActivateAsync("nope"); Check(false, "Activate unknown module throws"); }
catch (WebApiException e) { Check(e.StatusCode == 404, $"Activate unknown -> WebApiException {e.StatusCode}"); }

var removed = await modules.UninstallAsync("greeting");
Check(removed.Id == "greeting", "UninstallAsync");
Check((await modules.ListAsync()).All(s => s.Module?.Id != "greeting"), "gone after uninstall");

Console.WriteLine(failures == 0 ? "ALL PASS" : $"{failures} FAILED");
return failures;
