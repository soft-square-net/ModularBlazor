using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Registrations;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;
using soft.square.net.ModularBlazor.Infrastructure.Security;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Endpoints;

public sealed class RegisterModuleForm
{
    public IFormFile File { get; set; } = null!;

    /// <summary>A ModuleRegistrationRequest as JSON (id, name, routePrefixes, layout, ...). Optional.</summary>
    public string? Metadata { get; set; }
}

/// <summary>
/// Client modules in the catalog: register (upload) them, enable / disable them, and the download the Blazor client uses.
///   POST   /api/v1/modules/registrations/plan            the host modules a client module needs, and what would be installed
///   POST   /api/v1/modules/registrations                 upload a .dll / .nupkg and register it (installs approved host modules first)
///   GET    /api/v1/modules/registrations                 every registration, enabled or not
///   PUT    /api/v1/modules/registrations/{id}            edit metadata
///   PUT    /api/v1/modules/registrations/{id}/enabled    enable / disable
///   DELETE /api/v1/modules/registrations/{id}
///   GET    /api/modules/{id}/file                        what the client downloads (core: public; user modules: by role)
/// </summary>
public sealed class ModuleRegistrationEndpoints : ICarterModule
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/v1/modules/registrations").WithTags("Module store");

        admin.MapGet("/", async (ISender sender, CancellationToken ct) => Results.Ok(await sender.Send(new ListModuleRegistrationsQuery(), ct)))
            .WithName("ListModuleRegistrations")
            .WithSummary("Client modules registered in the catalog, enabled or not")
            .RequirePermission(Permissions.Modules.View, Permissions.Modules.Manage)
            .Produces<IReadOnlyList<ModuleRegistrationDto>>();

        admin.MapPost("/plan", async (ModuleRegistrationRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new PlanModuleRegistrationQuery(request), ct)))
            .WithName("PlanModuleRegistration")
            .WithSummary("What registering this client module would install on the host (its host modules)")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<RegistrationPlanDto>();

        admin.MapPost("/", async ([FromForm] RegisterModuleForm form, ISender sender, ModuleStoreOptions options, CancellationToken ct) =>
            {
                if (!options.AllowUpload)
                    return Results.Problem("Uploading modules is disabled (ModuleStore:AllowUpload).", statusCode: StatusCodes.Status403Forbidden);
                if (form.File is null || form.File.Length == 0)
                    return Results.Problem("A file is required.", statusCode: StatusCodes.Status400BadRequest);
                if (form.File.Length > options.MaxUploadMb * 1024L * 1024L)
                    return Results.Problem($"The file is larger than {options.MaxUploadMb} MB.", statusCode: StatusCodes.Status413PayloadTooLarge);

                ModuleRegistrationRequest request;
                try
                {
                    request = string.IsNullOrWhiteSpace(form.Metadata)
                        ? new ModuleRegistrationRequest()
                        : JsonSerializer.Deserialize<ModuleRegistrationRequest>(form.Metadata, Json) ?? new ModuleRegistrationRequest();
                }
                catch (JsonException ex)
                {
                    return Results.Problem($"The metadata is not valid JSON: {ex.Message}", statusCode: StatusCodes.Status400BadRequest);
                }

                await using var stream = form.File.OpenReadStream();
                return Results.Ok(await sender.Send(new RegisterClientModuleCommand(form.File.FileName, stream, request), ct));
            })
            .DisableAntiforgery()   // bearer / API-key API: no cookies, no CSRF
            .WithMetadata(new RequestSizeLimitAttribute(200L * 1024 * 1024))
            .Accepts<RegisterModuleForm>("multipart/form-data")
            .WithName("RegisterClientModule")
            .WithSummary("Upload a client module (.dll / .nupkg) and register it in the catalog")
            .WithDescription("A new id starts disabled. An existing id gets the new file and keeps its metadata.")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleRegistrationDto>()
            .ProducesValidationProblem();

        admin.MapPut("/{id}", async (string id, ModuleRegistrationRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new UpdateModuleRegistrationCommand(id, request), ct)))
            .WithName("UpdateModuleRegistration")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleRegistrationDto>();

        admin.MapPut("/{id}/enabled", async (string id, SetEnabledRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SetModuleRegistrationEnabledCommand(id, request.Enabled), ct)))
            .WithName("SetModuleRegistrationEnabled")
            .WithSummary("Offer the module to clients (or stop offering it)")
            .RequirePermission(Permissions.Modules.Manage)
            .Produces<ModuleRegistrationDto>();

        admin.MapDelete("/{id}", async (string id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteModuleRegistrationCommand(id), ct);
                return Results.NoContent();
            })
            .WithName("DeleteModuleRegistration")
            .RequirePermission(Permissions.Modules.Manage);

        // What the Blazor client downloads. The file's SHA-256 is the ETag, so a client that still holds it gets a 304.
        app.MapGet("/api/modules/{id}/file", async (string id, ClaimsPrincipal user, ISender sender, CancellationToken ct) =>
            {
                var roles = user.FindAll(ClaimNames.Role).Select(c => c.Value).ToArray();
                var file = await sender.Send(new GetModuleFileQuery(id, user.Identity?.IsAuthenticated == true, roles), ct);
                return Results.File(file.Content, file.ContentType, file.FileName,
                    entityTag: file.ETag is null ? null : new EntityTagHeaderValue($"\"{file.ETag}\""));
            })
            .AllowAnonymous() // core modules are public; the handler checks user modules against the caller's roles
            .WithName("DownloadModule")
            .WithTags("Modules")
            .WithSummary("The module's .dll / .nupkg for the Blazor client")
            .Produces(StatusCodes.Status200OK, contentType: "application/octet-stream")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}
