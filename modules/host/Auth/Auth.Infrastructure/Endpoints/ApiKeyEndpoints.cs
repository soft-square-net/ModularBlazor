using MediatR;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.ApiKeys;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Endpoints;

/// <summary>API keys: /api/v1/identity/api-keys. A key authenticates requests ("X-API-Key") as its owner.</summary>
public sealed class ApiKeyEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup($"{IdentityRoutes.Base}/api-keys").WithTags("API keys");

        group.MapPost("/", async (CreateApiKeyCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .RequirePermission(Permissions.ApiKeys.Create)
            .WithName("CreateApiKey").WithSummary("Create a key owned by you; the key is shown only in this response")
            .Produces<CreatedApiKeyDto>().ProducesValidationProblem();

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchApiKeysQuery(filter), ct)))
            .RequirePermission(Permissions.ApiKeys.View)
            .WithName("SearchApiKeys").WithSummary("Page through API keys (never the key itself)")
            .Produces<PagedResponse<ApiKeyDto>>();

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new RevokeApiKeyCommand(id), ct);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.ApiKeys.Revoke)
            .WithName("RevokeApiKey").WithSummary("Revoke an API key")
            .Produces(StatusCodes.Status204NoContent);
    }
}
