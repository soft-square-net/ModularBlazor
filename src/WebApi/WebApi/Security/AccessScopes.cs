using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Security;

/// <summary>
/// Platform role → platform permissions (<c>Access:Roles:{role}:N</c>; <see cref="PlatformRoles.Admin"/> holds every
/// platform permission by default). Platform permissions apply in every tenant and without one.
/// </summary>
internal sealed class PlatformRolePermissions
{
    private readonly Dictionary<string, HashSet<string>> _roles = new(StringComparer.OrdinalIgnoreCase);

    public PlatformRolePermissions(IConfiguration configuration)
    {
        _roles[PlatformRoles.Admin] = PlatformPermissions.All.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        foreach (var role in configuration.GetSection("Access:Roles").GetChildren())
            _roles[role.Key] = role.GetChildren().Select(c => c.Value!).Where(v => !string.IsNullOrWhiteSpace(v)).ToHashSet(StringComparer.Ordinal);
    }

    public IEnumerable<string> For(ClaimsPrincipal user) =>
        user.FindAll(PlatformClaims.Role).SelectMany(c => _roles.GetValueOrDefault(c.Value) ?? []).Distinct();
}

/// <summary>
/// Every grant (current and future) of a user in a tenant, cached per replica for at most <see cref="Lifetime"/> and
/// dropped on every replica when grants change (broker fanout "access.grants.changed"). Time windows are evaluated at
/// check time, so a shift grant starts and ends on the clock without any cache event.
/// </summary>
internal sealed class GrantCache(IServiceScopeFactory scopes, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<(string Tenant, string User), Entry> _entries = new();

    private sealed record Entry(IReadOnlyList<AccessGrant> Grants, DateTimeOffset Expires);

    public async Task<IReadOnlyList<AccessGrant>> GetAsync(string tenantId, string userId, CancellationToken ct)
    {
        var key = (tenantId, userId);
        if (_entries.TryGetValue(key, out var entry) && entry.Expires > clock.GetUtcNow()) return entry.Grants;

        await using var scope = scopes.CreateAsyncScope();
        var grants = await scope.ServiceProvider.GetRequiredService<IGrantRepository>().ListAsync(tenantId, userId, null, ct);
        _entries[key] = new Entry(grants, clock.GetUtcNow() + Lifetime);
        return grants;
    }

    /// <summary>Drops cached grants of the users (all users of the tenant when null). Local only; see <see cref="IGrantChangeBus"/>.</summary>
    public void Invalidate(string tenantId, IReadOnlyCollection<string>? userIds)
    {
        foreach (var key in _entries.Keys.Where(k => k.Tenant == tenantId && (userIds is null || userIds.Contains(k.User))))
            _entries.TryRemove(key, out _);
    }
}

/// <summary>The scoped <see cref="IAccessScopes"/>: the caller from the request, the tenant from <see cref="ITenantContext"/>.</summary>
internal sealed class AccessScopes(IHttpContextAccessor http, ITenantContext tenant, GrantCache cache, PlatformRolePermissions roles,
    TimeProvider clock) : IAccessScopes
{
    private ClaimsPrincipal? User => http.HttpContext?.User is { Identity.IsAuthenticated: true } user ? user : null;

    public string? UserId => User?.FindFirst(PlatformClaims.Subject)?.Value;

    public async Task<bool> HasPermissionAsync(string permission, CancellationToken ct = default) =>
        HasPlatform(permission) || (await ActiveAsync(UserId, ct)).Any(g => g.Permission == permission);

    public async Task<bool> HasPermissionAsync(string permission, IReadOnlyCollection<string> resourceScopes, CancellationToken ct = default) =>
        HasPlatform(permission) || (await ActiveAsync(UserId, ct)).Any(g => g.Permission == permission && g.Covers(resourceScopes));

    public async Task<IReadOnlyList<string>> ScopesAsync(string permission, CancellationToken ct = default)
    {
        if (HasPlatform(permission)) return [AccessScope.Tenant];
        var scopes = (await ActiveAsync(UserId, ct)).Where(g => g.Permission == permission).Select(g => g.Scope).Distinct().ToList();
        return scopes.Contains(AccessScope.Tenant) ? [AccessScope.Tenant] : scopes;
    }

    public async Task<IReadOnlyCollection<string>> PermissionsAsync(CancellationToken ct = default)
    {
        var platform = User is { } user ? roles.For(user) : [];
        return platform.Concat((await ActiveAsync(UserId, ct)).Select(g => g.Permission)).Distinct().Order().ToArray();
    }

    public async Task<bool> UserHasPermissionAsync(string userId, string permission, IReadOnlyCollection<string> resourceScopes, CancellationToken ct = default) =>
        (await ActiveAsync(userId, ct)).Any(g => g.Permission == permission && g.Covers(resourceScopes));

    private bool HasPlatform(string permission) => User is { } user && roles.For(user).Contains(permission);

    private async Task<IEnumerable<AccessGrant>> ActiveAsync(string? userId, CancellationToken ct)
    {
        if (userId is null || tenant.TenantId is not { } tenantId) return [];
        var now = clock.GetUtcNow();
        return (await cache.GetAsync(tenantId, userId, ct)).Where(g => g.IsActiveAt(now));
    }
}

/// <summary>
/// Evaluates <see cref="PermissionRequirement"/> (endpoint-level, coarse): the caller holds one of the permissions in
/// some scope of the request's tenant, or through a platform role. Runs in the host's request scope, before the module
/// scope exists, so modules never take part in it.
/// </summary>
internal sealed class PermissionAuthorizationHandler(IHttpContextAccessor accessor) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var http = context.Resource as HttpContext ?? accessor.HttpContext;
        if (http is null) return;
        var access = http.RequestServices.GetRequiredService<IAccessScopes>();
        foreach (var permission in requirement.AnyOf)
        {
            if (await access.HasPermissionAsync(permission, http.RequestAborted))
            {
                context.Succeed(requirement);
                return;
            }
        }
    }
}
