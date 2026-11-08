
using Microsoft.AspNetCore.Authorization;
using soft.square.net.Share.All.Authorization;
using System.Security.Claims;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth;

public static class AuthorizationServiceExtensions
{
    public static async Task<bool> HasPermissionAsync(this IAuthorizationService service, ClaimsPrincipal user, string action, string resource)
    {
        return (await service.AuthorizeAsync(user, null, UsrPermission.NameFor(action, resource))).Succeeded;
    }
}
