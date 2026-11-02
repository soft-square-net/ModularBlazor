using MediatR;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Queries.GetModulesForRole;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Endpoints;

/// <summary>GET /api/me/modules - metadata for the signed-in user.</summary>
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

    private static async Task<IResult> Handle(HttpRequest request, ISender sender, CancellationToken cancellationToken)
        => DemoToken.TryGetRole(request.Headers.Authorization.ToString(), out var role)
            ? Results.Ok(await sender.Send(new GetModulesForRoleQuery(role), cancellationToken))
            : Results.Unauthorized();
}
