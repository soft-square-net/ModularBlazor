using MediatR;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Tokens;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Endpoints;

public static class IdentityRoutes
{
    public const string Base = "/api/v1/identity";
}

/// <summary>Sign in, refresh and sign out. Send the tenant in the X-Tenant header (none: the root tenant).</summary>
public sealed class TokenEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup($"{IdentityRoutes.Base}/tokens").WithTags("Tokens").AllowAnonymous();

        group.MapPost("/", async (LoginCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .WithName("IssueToken")
            .WithSummary("Sign in with user name (or email) and password; returns a JWT access token and a refresh token")
            .Produces<TokenResult>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        group.MapPost("/refresh", async (RefreshTokenCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .WithName("RefreshToken")
            .WithSummary("Exchange a refresh token for a new access token and refresh token")
            .Produces<TokenResult>()
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        group.MapPost("/revoke", async (RevokeRefreshTokenCommand command, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(command, ct);
                return Results.NoContent();
            })
            .WithName("RevokeToken")
            .WithSummary("Sign out: revoke a refresh token")
            .Produces(StatusCodes.Status204NoContent);
    }
}
