using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Endpoints;

public sealed record SetEnabledRequest(bool Enabled);

public sealed record SetConfigurationRequest(string? Configuration);

public sealed class UploadModulePackageForm
{
    public IFormFile File { get; set; } = null!;
    public ModuleTarget Target { get; set; }
    public string? Name { get; set; }
}

/// <summary>
/// The module store: /api/v1/modules/packages. Upload host or client modules (.dll / .nupkg), download them,
/// enable them, give them configuration, and restart the app so a rebuild picks the enabled host modules up.
/// </summary>
public sealed class ModulePackageEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/modules").WithTags("Module store");

        group.MapGet("/packages", async (ModuleTarget? target, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new ListModulePackagesQuery(target), ct)))
            .WithName("ListModulePackages")
            .WithSummary("Packages in the module store (host and client)")
            .RequirePermission(Permissions.Modules.View, Permissions.Modules.Manage)
            .Produces<IReadOnlyList<ModulePackageDto>>();

        group.MapGet("/packages/{id}", async (string id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetModulePackageQuery(id), ct)))
            .WithName("GetModulePackage")
            .RequirePermission(Permissions.Modules.View, Permissions.Modules.Manage)
            .Produces<ModulePackageDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/packages/{id}/download", async (string id, ISender sender, CancellationToken ct) =>
            {
                var file = await sender.Send(new DownloadModulePackageQuery(id), ct);
                return Results.File(file.Content, file.ContentType, file.FileName);
            })
            .WithName("DownloadModulePackage")
            .WithSummary("Download the .dll or .nupkg")
            .RequirePermission(Permissions.Modules.View, Permissions.Modules.Manage)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/packages", async ([FromForm] UploadModulePackageForm form, ISender sender, ModuleStoreOptions options, CancellationToken ct) =>
            {
                if (!options.AllowUpload)
                    return Results.Problem("Uploading modules is disabled (ModuleStore:AllowUpload).", statusCode: StatusCodes.Status403Forbidden);
                if (form.File is null || form.File.Length == 0)
                    return Results.Problem("A file is required.", statusCode: StatusCodes.Status400BadRequest);
                if (form.File.Length > options.MaxUploadMb * 1024L * 1024L)
                    return Results.Problem($"The file is larger than {options.MaxUploadMb} MB.", statusCode: StatusCodes.Status413PayloadTooLarge);

                await using var stream = form.File.OpenReadStream();
                return Results.Ok(await sender.Send(new UploadModulePackageCommand(form.Target, form.File.FileName, stream, form.Name), ct));
            })
            .DisableAntiforgery()   // bearer / API-key API: no cookies, no CSRF
            .WithMetadata(new RequestSizeLimitAttribute(200L * 1024 * 1024))
            .Accepts<UploadModulePackageForm>("multipart/form-data")
            .WithName("UploadModulePackage")
            .WithSummary("Upload a host or client module (.dll / .nupkg); it starts disabled")
            .WithDescription("Needs ModuleStore:AllowUpload=true. An enabled host module runs inside the API after the next rebuild.")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModulePackageDto>()
            .ProducesValidationProblem();

        group.MapPut("/packages/{id}/enabled", async (string id, SetEnabledRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SetModulePackageEnabledCommand(id, request.Enabled), ct)))
            .WithName("SetModulePackageEnabled")
            .WithSummary("Enable or disable a package (host: takes effect after a rebuild; see rebuildRequired)")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModulePackageDto>();

        group.MapPut("/packages/{id}/configuration", async (string id, SetConfigurationRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SetModulePackageConfigurationCommand(id, request.Configuration), ct)))
            .WithName("SetModulePackageConfiguration")
            .WithSummary("Set the package's configuration (a JSON object, injected as Modules:<Name> at startup)")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModulePackageDto>()
            .ProducesValidationProblem();

        group.MapDelete("/packages/{id}", async (string id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteModulePackageCommand(id), ct);
                return Results.NoContent();
            })
            .WithName("DeleteModulePackage")
            .RequirePermission(Permissions.Modules.Manage);

        group.MapPost("/restart", (IModuleRestart restart) =>
            {
                restart.Request();
                return Results.Accepted(value: new { message = "Stopping. A supervisor (scripts/run-host.*) rebuilds and starts the host again." });
            })
            .WithName("RestartHost")
            .WithSummary("Stop the app so the supervisor rebuilds it with the enabled host modules")
            .RequirePermission(Permissions.Modules.Manage);
    }
}
