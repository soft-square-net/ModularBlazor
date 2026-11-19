using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Net.Http.Headers;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Core.ClientModules;

/// <summary>
/// /api/client-modules: the client manifest and files (anonymous or signed in, filtered per caller), and the admin API
/// (<see cref="PlatformPermissions.ModulesManage"/>: a client module is code every user's browser runs).
/// Endpoint names are the OpenAPI operation ids: "ClientModules_Upload" becomes ClientModulesClient.UploadAsync in
/// WebApi.Modules.Core.ClientModules.Client.
/// </summary>
public sealed class ClientModulesEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var root = app.MapGroup("")
            .TenantOptional()
            .AddEndpointFilter(async (context, next) =>
            {
                try { return await next(context); }
                catch (ClientModuleException e) { return Results.Problem(e.Message, statusCode: e.StatusCode); }
            });

        MapClient(root);
        MapAdmin(root.MapGroup("").RequirePermission(PlatformPermissions.ModulesManage));
    }

    // ---------------------------------------------------------------- the client app

    private static void MapClient(RouteGroupBuilder root)
    {
        root.MapGet("/manifest", (HttpContext http, ClientModuleCatalog catalog, ITenantContext tenant) =>
            {
                var manifest = catalog.Manifest(http.User, tenant.TenantId);
                var etag = $"\"{manifest.ETag}\"";
                http.Response.Headers.ETag = etag;
                http.Response.Headers.CacheControl = "private, no-cache"; // revalidate every time: a 304 is cheap
                http.Response.Headers.Vary = "Authorization, X-Tenant";
                var known = http.Request.Headers.IfNoneMatch.SelectMany(v => (v ?? "").Split(',')).Select(t => t.Trim());
                if (known.Any(t => t == etag || t == "W/" + etag || t == "*"))
                    return Results.StatusCode(StatusCodes.Status304NotModified);
                return Results.Ok(manifest);
            })
            .AllowAnonymous()
            .Produces<ClientModuleManifest>()
            .Produces(StatusCodes.Status304NotModified)
            .WithName("ClientModules_GetManifest")
            .WithSummary("The client modules the caller may use (anonymous: the public ones, such as layouts), startup modules first, " +
                         "with their dependencies. Sends an ETag; If-None-Match answers 304 when nothing changed.");

        root.MapGet("/files/{id}/{version}/{file}", (string id, string version, string file, HttpContext http, ClientModuleCatalog catalog, ITenantContext tenant) =>
            {
                if (catalog.ResolveFile(http.User, tenant.TenantId, id, version, file) is not { } found)
                    return Results.NotFound();
                // The URL carries the file's SHA-256, so a copy is valid for good.
                http.Response.Headers.CacheControl = $"{(found.Public ? "public" : "private")}, max-age=31536000, immutable";
                return Results.File(found.Path, "application/octet-stream", entityTag: new EntityTagHeaderValue($"\"{found.File.Sha256}\""));
            })
            .AllowAnonymous()
            // Not in the document: clients download the URLs the manifest lists (they carry the hash), not a generated call.
            .ExcludeFromDescription()
            .WithName("ClientModules_GetFile");
    }

    // ---------------------------------------------------------------- admin

    private static void MapAdmin(RouteGroupBuilder admin)
    {
        admin.MapGet("/modules", (ClientModuleCatalog catalog) => catalog.List())
            .WithName("ClientModules_List")
            .WithSummary("Every client module with its settings and versions.");

        admin.MapGet("/modules/{id}", (string id, ClientModuleCatalog catalog) => catalog.Get(id))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_Get");

        admin.MapPost("/uploads", async (IFormFile package, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
            {
                await using var content = package.OpenReadStream();
                var upload = await catalog.UploadAsync(package.FileName, content, UserOf(http), ct);
                return Results.Created($"uploads/{upload.Token}", upload);
            })
            .DisableAntiforgery()
            .Produces<ClientModuleUpload>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .WithName("ClientModules_Upload")
            .WithSummary("Step 1: upload a .dll, .nupkg or .zip. It is checked (read as metadata, never run) and kept for an hour as a " +
                         "draft: id, version, detected settings, pages, layouts, warnings, and how it compares with what is installed.");

        admin.MapGet("/uploads/{token}", (string token, ClientModuleCatalog catalog) => catalog.GetUpload(token))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_GetUpload");

        admin.MapPost("/uploads/{token}/install", (string token, InstallClientModule request, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.InstallAsync(token, request, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("ClientModules_Install")
            .WithSummary("Step 2: install the upload. A new module gets the settings sent (or the detected ones); an installed one keeps " +
                         "its settings unless others are sent. 409 when the version exists with other files (replace = true overwrites).");

        admin.MapDelete("/uploads/{token}", (string token, ClientModuleCatalog catalog) =>
            {
                catalog.DiscardUpload(token);
                return Results.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_DiscardUpload");

        admin.MapPut("/modules/{id}/settings", (string id, ClientModuleSettings settings, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.UpdateSettingsAsync(id, settings, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_UpdateSettings")
            .WithSummary("Replaces the module's settings: who gets it, when it loads, routes, layout, dependencies, menu entries.");

        admin.MapPost("/modules/{id}/enable", (string id, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.SetEnabledAsync(id, true, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_Enable");

        admin.MapPost("/modules/{id}/disable", (string id, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.SetEnabledAsync(id, false, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_Disable")
            .WithSummary("Leaves the module out of every manifest (clients drop it on their next manifest check). Files are kept.");

        admin.MapPost("/modules/{id}/versions/{version}/activate", (string id, string version, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.ActivateVersionAsync(id, version, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("ClientModules_ActivateVersion")
            .WithSummary("Makes this installed version the one the manifest hands out (upgrade or rollback).");

        admin.MapDelete("/modules/{id}/versions/{version}", (string id, string version, HttpContext http, ClientModuleCatalog catalog, CancellationToken ct) =>
                catalog.DeleteVersionAsync(id, version, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("ClientModules_DeleteVersion")
            .WithSummary("Deletes a version that is not the active one.");

        admin.MapDelete("/modules/{id}", async (string id, ClientModuleCatalog catalog, CancellationToken ct) =>
            {
                await catalog.DeleteAsync(id, ct);
                return Results.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("ClientModules_Delete")
            .WithSummary("Deletes the module and its files. 409 for core modules (disable them) and when other modules depend on it.");
    }

    private static string? UserOf(HttpContext http) =>
        http.User.FindFirst(PlatformClaims.Subject)?.Value ?? http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? http.User.Identity?.Name;
}
