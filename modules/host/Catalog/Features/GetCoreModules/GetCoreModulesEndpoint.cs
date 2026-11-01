using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Features.GetCoreModules;

/// <summary>Vertical slice: GET /api/modules/core - modules loaded at startup (public).</summary>
public sealed class GetCoreModulesEndpoint : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/modules/core", Handle)
            .WithName("GetCoreModules")
            .WithTags("Modules")
            .WithSummary("Modules loaded at startup")
            .WithDescription("Layouts and the login page. Public: needed before anyone signs in.")
            .Produces<ModuleManifest>();
    }

    private static IResult Handle(IModuleCatalog catalog) => Results.Ok(catalog.GetCoreModules());
}
