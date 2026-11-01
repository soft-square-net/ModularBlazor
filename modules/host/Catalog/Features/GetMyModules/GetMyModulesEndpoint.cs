using ModularBlazor.Abstractions;
using ModularBlazor.Core;

namespace ModularBlazor.Host.Modules.Catalog.Features.GetMyModules;

/// <summary>Vertical slice: GET /api/me/modules - metadata for the signed-in user.</summary>
public sealed class GetMyModulesEndpoint : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/me/modules", Handle)
            .WithName("GetMyModules")
            .WithTags("Modules")
            .WithSummary("Modules available to the signed-in user")
            .WithDescription("Metadata only; the client downloads each module's code when its route is first visited. Send 'Authorization: Bearer <token>' from /api/auth/login.")
            .Produces<ModuleManifest>()
            .Produces(StatusCodes.Status401Unauthorized);
    }

    private static IResult Handle(HttpRequest request, IModuleCatalog catalog)
        => DemoToken.TryGetRole(request.Headers.Authorization.ToString(), out var role)
            ? Results.Ok(catalog.GetModulesForRole(role))
            : Results.Unauthorized();
}
