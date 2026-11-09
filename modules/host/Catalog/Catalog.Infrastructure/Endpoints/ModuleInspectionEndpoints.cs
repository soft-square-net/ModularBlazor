using MediatR;
using Microsoft.AspNetCore.Mvc;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Registrations;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;
using soft.square.net.ModularBlazor.Infrastructure.Security;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Endpoints;

public sealed class InspectModuleForm
{
    public IFormFile File { get; set; } = null!;
}

/// <summary>
/// Install a module from nothing but its file:
///   POST   /api/v1/modules/inspections                       upload; answers what it is and its default settings (the file waits)
///   GET    /api/v1/modules/inspections/{token}               the same answer again
///   POST   /api/v1/modules/inspections/{token}/install-client  confirm the settings of a client / layout module: register + activate
///   POST   /api/v1/modules/inspections/{token}/install-host    confirm the settings of a host module: store + enable (rebuild needed)
///   DELETE /api/v1/modules/inspections/{token}               discard the waiting file
/// </summary>
public sealed class ModuleInspectionEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/modules/inspections").WithTags("Module store");

        group.MapPost("/", async ([FromForm] InspectModuleForm form, ISender sender, ModuleStoreOptions options, CancellationToken ct) =>
            {
                if (!options.AllowUpload)
                    return Results.Problem("Uploading modules is disabled (ModuleStore:AllowUpload).", statusCode: StatusCodes.Status403Forbidden);
                if (form.File is null || form.File.Length == 0)
                    return Results.Problem("A file is required.", statusCode: StatusCodes.Status400BadRequest);
                if (form.File.Length > options.MaxUploadMb * 1024L * 1024L)
                    return Results.Problem($"The file is larger than {options.MaxUploadMb} MB.", statusCode: StatusCodes.Status413PayloadTooLarge);

                await using var stream = form.File.OpenReadStream();
                return Results.Ok(await sender.Send(new InspectModuleCommand(form.File.FileName, stream), ct));
            })
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(200L * 1024 * 1024))
            .Accepts<InspectModuleForm>("multipart/form-data")
            .WithName("InspectModule")
            .WithSummary("Upload a module file; the answer says what it is (client, layout or host) and its default settings")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleInspectionDto>();

        group.MapGet("/{token}", async (string token, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetModuleInspectionQuery(token), ct)))
            .WithName("GetModuleInspection")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleInspectionDto>();

        group.MapPost("/{token}/install-client", async (string token, ModuleRegistrationRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new InstallInspectedClientModuleCommand(token, request), ct)))
            .WithName("InstallInspectedClientModule")
            .WithSummary("Register and activate the waiting client / layout module with the confirmed settings")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleRegistrationDto>();

        group.MapPost("/{token}/install-host", async (string token, HostModuleSettings settings, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new InstallInspectedHostModuleCommand(token, settings), ct)))
            .WithName("InstallInspectedHostModule")
            .WithSummary("Store and enable the waiting host module with the confirmed settings (takes effect after a rebuild)")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModulePackageDto>();

        group.MapDelete("/{token}", async (string token, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DiscardModuleInspectionCommand(token), ct);
                return Results.NoContent();
            })
            .WithName("DiscardModuleInspection")
            .RequirePermission(Permissions.Modules.Manage);
    }
}
