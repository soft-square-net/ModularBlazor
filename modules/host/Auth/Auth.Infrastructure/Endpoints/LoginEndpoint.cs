using MediatR;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Commands.Login;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Endpoints;

public sealed record LoginRequest(string UserName, string Password);

public sealed record LoginResponse(string UserName, string Role, string Token);

/// <summary>POST /api/auth/login - maps HTTP to the LoginCommand.</summary>
public sealed class LoginEndpoint : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", Handle)
            .WithName("Login")
            .WithTags("Auth")
            .WithSummary("Sign in")
            .WithDescription("Demo sign-in: any non-empty user name and password works. The user name 'admin' gets the admin role.")
            .Produces<LoginResponse>()
            .ProducesValidationProblem();
    }

    private static async Task<IResult> Handle(LoginRequest request, ISender sender, CancellationToken cancellationToken)
    {
        var result = await sender.Send(new LoginCommand(request.UserName, request.Password), cancellationToken);
        return Results.Ok(new LoginResponse(result.UserName, result.Role, result.Token));
    }
}
