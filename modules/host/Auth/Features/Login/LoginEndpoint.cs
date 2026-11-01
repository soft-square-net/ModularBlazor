using ModularBlazor.Core;

namespace ModularBlazor.Host.Modules.Auth.Features.Login;

public sealed record LoginRequest(string UserName, string Password);

public sealed record LoginResponse(string UserName, string Role, string Token);

/// <summary>Vertical slice: POST /api/auth/login - contract, route and handler in one place.</summary>
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
            .ProducesProblem(StatusCodes.Status400BadRequest);
    }

    private static IResult Handle(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.UserName) || string.IsNullOrEmpty(request.Password))
            return Results.Problem("User name and password are required.", statusCode: StatusCodes.Status400BadRequest);

        var userName = request.UserName.Trim();
        var role = userName.Equals("admin", StringComparison.OrdinalIgnoreCase) ? "admin" : "user";

        return Results.Ok(new LoginResponse(userName, role, DemoToken.Issue(role)));
    }
}
