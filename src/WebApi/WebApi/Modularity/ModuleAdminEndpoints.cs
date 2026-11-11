using Carter;

namespace soft.square.net.WebApi.Modularity;

/// <summary>Admin API for the runtime module lifecycle. Built into the host; no authorization yet (prototype).</summary>
public sealed class ModuleAdminEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var modules = app.MapGroup("/api/admin/modules")
            .WithTags("Module admin")
            .AddEndpointFilter(async (context, next) =>
            {
                try { return await next(context); }
                catch (ModuleException e) { return Results.Problem(e.Message, statusCode: e.StatusCode); }
            });

        modules.MapGet("/", (ModuleRuntime runtime, CancellationToken ct) => runtime.ListAsync(ct));

        modules.MapGet("/unloading", (ModuleRuntime runtime, CancellationToken ct) => runtime.PendingUnloadsAsync(ct))
            .WithSummary("Unloaded modules whose assemblies are not collected yet.");

        modules.MapPost("/", async (IFormFile package, ModuleRuntime runtime, CancellationToken ct) =>
            {
                await using var content = package.OpenReadStream();
                var record = await runtime.InstallAsync(content, package.FileName, ct);
                return Results.Created($"/api/admin/modules/{record.Id}", record);
            })
            .DisableAntiforgery()
            .WithSummary("Install: upload a .dll, .zip or .nupkg; the manifest is read and registered.");

        modules.MapPost("/{id}/activate", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.ActivateAsync(id, ct))
            .WithSummary("Load the assembly (if needed), build its services and map its routes.");

        modules.MapPost("/{id}/deactivate", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.DeactivateAsync(id, ct))
            .WithSummary("Remove the module's routes; it stays loaded.");

        modules.MapPost("/{id}/unload", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.UnloadAsync(id, ct))
            .WithSummary("Remove routes, dispose services and unload the assembly.");

        modules.MapPut("/{id}/settings", (string id, Dictionary<string, string?> settings, ModuleRuntime runtime, CancellationToken ct) =>
                runtime.UpdateSettingsAsync(id, settings, ct))
            .WithSummary("Replace the module's settings; applied on its next load.");

        modules.MapDelete("/{id}", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.UninstallAsync(id, ct))
            .WithSummary("Unload, delete the package and remove the registration. Core modules: 409 (deactivate or unload them instead).");
    }
}
