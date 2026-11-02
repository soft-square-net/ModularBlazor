using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Core.Abstractions;

namespace soft.square.net.ModularBlazor.Infrastructure.Identity;

/// <summary>
/// The caller of the current HTTP request: claims of an authenticated user, else (demo token only) "demo-{role}".
/// Anonymous and background work have no user.
/// </summary>
public sealed class HttpContextCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public string? UserId => accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);

    public string? UserName
    {
        get
        {
            var context = accessor.HttpContext;
            if (context is null) return null;

            var name = context.User.Identity?.Name;
            if (!string.IsNullOrEmpty(name)) return name;

            return DemoToken.TryGetRole(context.Request.Headers.Authorization.ToString(), out var role)
                ? $"demo-{role}"
                : null;
        }
    }
}
