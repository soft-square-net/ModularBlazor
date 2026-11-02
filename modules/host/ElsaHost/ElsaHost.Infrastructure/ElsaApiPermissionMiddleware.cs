using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure;

/// <summary>
/// Protects Elsa's API with this host's authentication (JWT or X-API-Key) and permissions:
/// GET needs Workflows.View or Workflows.Manage, everything else Workflows.Manage.
/// Elsa's own endpoints are not Carter endpoints, so they cannot use RequirePermission directly.
/// </summary>
internal sealed class ElsaApiPermissionMiddleware(RequestDelegate next, string basePath)
{
    public async Task InvokeAsync(HttpContext context, IAuthorizationService authorization)
    {
        if (!context.Request.Path.StartsWithSegments(basePath, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        if (context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var read = HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method);
        var needed = read ? new[] { Permissions.Workflows.View, Permissions.Workflows.Manage } : [Permissions.Workflows.Manage];

        var result = await authorization.AuthorizeAsync(context.User, null, new PermissionRequirement(needed));
        if (!result.Succeeded)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }
}
