using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Infrastructure.Security;

public static class DemoAdminFilter
{
    /// <summary>
    /// DEMO ONLY: requires "Authorization: Bearer demo-admin". Replace with real authorization policies
    /// when the demo token is replaced by JWT/OIDC.
    /// </summary>
    public static TBuilder RequireDemoAdmin<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder
        => builder.AddEndpointFilter(async (context, next) =>
        {
            var header = context.HttpContext.Request.Headers.Authorization.ToString();
            if (!DemoToken.TryGetRole(header, out var role))
                return Results.Unauthorized();

            if (!role.Equals("admin", StringComparison.OrdinalIgnoreCase))
                return Results.Problem("The admin role is required.", statusCode: StatusCodes.Status403Forbidden);

            return await next(context);
        });
}
