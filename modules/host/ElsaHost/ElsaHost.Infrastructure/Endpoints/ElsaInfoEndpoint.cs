using MediatR;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Application.Queries;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure.Endpoints;

/// <summary>GET /api/v1/elsa/info - where the embedded Elsa API is and the tenant it will use for this request.</summary>
public sealed class ElsaInfoEndpoint : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
        => app.MapGet("/api/v1/elsa/info", async (ISender sender, CancellationToken ct) => Results.Ok(await sender.Send(new GetElsaInfoQuery(), ct)))
            .WithTags("Workflows")
            .WithName("GetElsaInfo")
            .WithSummary("Embedded Elsa workflow engine: API path, current tenant and schema")
            .RequirePermission(Permissions.Workflows.View, Permissions.Workflows.Manage)
            .Produces<ElsaInfoDto>();
}
