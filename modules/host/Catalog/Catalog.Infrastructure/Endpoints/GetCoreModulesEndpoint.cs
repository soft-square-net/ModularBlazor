using MediatR;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Queries.GetCoreModules;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Endpoints;

/// <summary>GET /api/modules/core - modules loaded at startup (public).</summary>
public sealed class GetCoreModulesEndpoint : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/modules/core", async (ISender sender, CancellationToken cancellationToken)
                => Results.Ok(await sender.Send(new GetCoreModulesQuery(), cancellationToken)))
            .WithName("GetCoreModules")
            .WithTags("Modules")
            .WithSummary("Modules loaded at startup")
            .WithDescription("Layouts and the login page. Public: needed before anyone signs in.")
            .Produces<ModuleManifest>();
    }
}
