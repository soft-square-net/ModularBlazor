using MediatR;
using System.Security.Claims;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;
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
            .WithDescription("Metadata only; the client downloads each module's code when its route is first visited. Send 'Authorization: Bearer <token>' from POST /api/v1/identity/tokens, or an X-API-Key.")
            .RequireAuthorization()
            .Produces<ModuleManifest>()
            .Produces(StatusCodes.Status401Unauthorized);
    }

    private static async Task<IResult> Handle(ClaimsPrincipal user, ISender sender, CancellationToken cancellationToken)
    {
        var roles = user.FindAll(ClaimNames.Role).Select(c => c.Value).ToArray();
        return Results.Ok(await sender.Send(new GetModulesForRoleQuery(roles), cancellationToken));
    }
}
