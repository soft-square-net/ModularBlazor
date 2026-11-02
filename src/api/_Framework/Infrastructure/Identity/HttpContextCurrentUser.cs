using Microsoft.AspNetCore.Http;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Identity;

/// <summary>The caller of the current HTTP request, from the claims of its access token or API key.</summary>
public sealed class HttpContextCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public string? UserId => accessor.HttpContext?.User.FindFirst(ClaimNames.Subject)?.Value;

    public string? UserName => accessor.HttpContext?.User.FindFirst(ClaimNames.Name)?.Value;
}
