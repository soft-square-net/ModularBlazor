using Carter;
using soft.square.net.WebApi.Contracts.Security;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Admin API for the runtime module lifecycle. Built into the host. Uploading a package runs its code, so the whole API
/// needs the platform permission <see cref="PlatformPermissions.ModulesManage"/> (platform operators only).
/// </summary>
public sealed class ModuleAdminEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var modules = app.MapGroup("/api/admin/modules")
            .WithTags("Module admin")
            .RequirePermission(PlatformPermissions.ModulesManage)
            .AddEndpointFilter(async (context, next) =>
            {
                try { return await next(context); }
                catch (ModuleException e) { return Results.Problem(e.Message, statusCode: e.StatusCode); }
            });

        // Endpoint names are the OpenAPI operation ids: "Modules_Activate" becomes ModulesClient.ActivateAsync in the
        // generated host client (src/WebApi/WebApi.Client). Every lifecycle error is a problem-details response.
        modules.MapGet("/", (ModuleRuntime runtime, CancellationToken ct) => runtime.ListAsync(ct))
            .WithName("Modules_List");

        modules.MapGet("/unloading", (ModuleRuntime runtime, CancellationToken ct) => runtime.PendingUnloadsAsync(ct))
            .WithName("Modules_ListUnloading")
            .WithSummary("Unloaded modules whose assemblies are not collected yet.");

        modules.MapPost("/", async (IFormFile package, ModuleRuntime runtime, CancellationToken ct) =>
            {
                await using var content = package.OpenReadStream();
                var record = await runtime.InstallAsync(content, package.FileName, ct);
                return Results.Created($"/api/admin/modules/{record.Id}", record);
            })
            .DisableAntiforgery()
            .Produces<ModuleRecord>(StatusCodes.Status201Created) // Results.Created hides the type from OpenAPI
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("Modules_Install")
            .WithSummary("Install: upload a .dll, .zip or .nupkg; the manifest is read and registered.");

        modules.MapPost("/{id}/activate", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.ActivateAsync(id, ct))
            .WithName("Modules_Activate")
            .WithSummary("Load the assembly (if needed), build its services and map its routes.");

        modules.MapPost("/{id}/deactivate", (string id, ModuleRuntime runtime, CancellationToken ct) => runtime.DeactivateAsync(id, ct))
            .WithName("Modules_Deactivate")
            .WithSummary("Remove the module's routes; it stays loaded.");

        modules.MapPost("/{id}/unload", (string id, ModuleRuntime runtime, CancellationToken ct, bool deferred = false) => runtime.UnloadAsync(id, deferred, ct))
            .WithName("Modules_Unload")
            .WithSummary("Remove routes, stop hosted services, dispose services and unload the assembly. HotUnload = false: 409 unless ?deferred=true (released at the next restart).");

        modules.MapPut("/{id}/settings", (string id, Dictionary<string, string?> settings, ModuleRuntime runtime, CancellationToken ct) =>
                runtime.UpdateSettingsAsync(id, settings, ct))
            .WithName("Modules_UpdateSettings")
            .WithSummary("Replace the module's settings; applied on its next load.");

        modules.MapDelete("/{id}", (string id, ModuleRuntime runtime, CancellationToken ct, bool deferred = false) => runtime.UninstallAsync(id, deferred, ct))
            .WithName("Modules_Uninstall")
            .WithSummary("Unload, delete the package and remove the registration. Core modules: 409 (deactivate or unload them instead). HotUnload = false: 409 unless ?deferred=true.");
    }
}
