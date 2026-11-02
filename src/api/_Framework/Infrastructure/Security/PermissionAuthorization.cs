using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using soft.square.net.ModularBlazor.Core.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Security;

/// <summary>Satisfied when the user holds any one of the permissions (a "permission" claim).</summary>
public sealed class PermissionRequirement(IReadOnlyCollection<string> permissions) : IAuthorizationRequirement
{
    public IReadOnlyCollection<string> Permissions { get; } = permissions;
}

internal sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var granted = context.User.FindAll(ClaimNames.Permission).Select(c => c.Value).ToHashSet();
        if (requirement.Permissions.Any(granted.Contains))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

public static class PermissionExtensions
{
    /// <summary>Requires an authenticated caller (JWT or API key) holding at least one of the permissions.</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, params string[] permissions)
        where TBuilder : IEndpointConventionBuilder
        => builder.RequireAuthorization(policy => policy
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(permissions)));
}
