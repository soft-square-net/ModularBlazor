using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Contracts.Security;

/// <summary>
/// Claims in access tokens issued by the identity service (short names: inbound claim mapping is off). Tokens carry who
/// the caller is and the one tenant the token is for; permissions are never in the token (see <see cref="IAccessScopes"/>).
/// </summary>
public static class PlatformClaims
{
    public const string Subject = "sub";
    public const string Name = "name";
    public const string Email = "email";
    /// <summary>Platform roles only (e.g. <see cref="PlatformRoles.Admin"/>); tenant rights are grants.</summary>
    public const string Role = "role";
    public const string AuthenticationMethods = "amr";
    public const string Tenant = TenancyNames.Claim;
}

/// <summary>Platform roles (token claim <see cref="PlatformClaims.Role"/>). They map to platform permissions in the host.</summary>
public static class PlatformRoles
{
    /// <summary>The platform operator: installs modules, provisions tenants, manages grants in any tenant.</summary>
    public const string Admin = "platform-admin";
}

/// <summary>Permissions defined by the platform itself. Any module may require them without declaring them.</summary>
public static class PlatformPermissions
{
    public const string ModulesManage = "platform.modules.manage";
    public const string TenantsManage = "platform.tenants.manage";
    /// <summary>Manage grants inside a tenant (tenant admins; platform admins in any tenant).</summary>
    public const string GrantsManage = "access.grants.manage";

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(ModulesManage, "Install, activate, configure and remove runtime modules."),
        new(TenantsManage, "Create, rename, suspend and re-activate tenants."),
        new(GrantsManage, "Grant and revoke permissions inside a tenant.")
    ];

    public static bool IsPlatform(string permission) => All.Any(p => p.Name == permission);
}

/// <summary>A permission a module declares in its manifest (shown in the permission catalog for role admin).</summary>
public sealed record PermissionDefinition(string Name, string? Description = null);

/// <summary>
/// Satisfied when the caller holds at least one of the permissions in the current tenant (in any scope), or through a
/// platform role. A host type: modules never contribute authorization types, so nothing in the host's authorization
/// pipeline can keep a module loaded. Fine-grained (per resource) checks are module code calling <see cref="IAccessScopes"/>.
/// </summary>
public sealed class PermissionRequirement(IReadOnlyList<string> anyOf) : IAuthorizationRequirement
{
    public IReadOnlyList<string> AnyOf { get; } = anyOf;

    public override string ToString() => $"Permission: {string.Join(" or ", AnyOf)}";
}

public static class PermissionEndpointExtensions
{
    /// <summary>
    /// Requires a signed-in caller holding at least one of <paramref name="anyOf"/>. The policy is built inline on the
    /// endpoint (no named policy, nothing registered in the host), so it comes and goes with the module's routes.
    /// Module permissions must be declared in <see cref="ModuleManifest.Permissions"/>; activation fails otherwise.
    /// </summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, params string[] anyOf) where TBuilder : IEndpointConventionBuilder
    {
        if (anyOf.Length == 0) throw new ArgumentException("Name at least one permission.", nameof(anyOf));
        var policy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(anyOf))
            .Build();
        return builder.RequireAuthorization(policy);
    }
}

/// <summary>
/// Scope strings of grants. A grant on <see cref="Tenant"/> covers the whole tenant; otherwise a grant matches when its
/// scope is one of the resource's scopes (an article in press A, category sports: <c>["press:A", "category:sports"]</c>).
/// </summary>
public static class AccessScope
{
    public const string Tenant = "tenant";

    public static string Press(string id) => $"press:{id}";

    public static string Category(string id) => $"category:{id}";

    public static string Of(string kind, string id) => $"{kind}:{id}";
}

/// <summary>Grant sources: who wrote the grant, so a producer can replace or end its own grants only.</summary>
public static class GrantSources
{
    /// <summary>Granted by an admin; no end unless one is set.</summary>
    public const string Standing = "standing";

    /// <summary>Written from a shift's rota: <c>shift:{shiftId}</c>.</summary>
    public static string Shift(string shiftId) => $"shift:{shiftId}";
}

/// <summary>
/// A permission in a scope for a user, inside one tenant, optionally only between <paramref name="ValidFrom"/> and
/// <paramref name="ValidTo"/> (UTC; shift grants).
/// </summary>
public sealed record AccessGrant(
    Guid Id,
    string TenantId,
    string UserId,
    string Permission,
    string Scope,
    DateTimeOffset? ValidFrom,
    DateTimeOffset? ValidTo,
    string Source,
    DateTimeOffset CreatedAt,
    string? CreatedBy)
{
    public bool IsActiveAt(DateTimeOffset now) => (ValidFrom is null || ValidFrom <= now) && (ValidTo is null || now < ValidTo);

    public bool Covers(IReadOnlyCollection<string> resourceScopes) =>
        Scope == AccessScope.Tenant || resourceScopes.Contains(Scope, StringComparer.OrdinalIgnoreCase);
}

/// <summary>A grant to write (the store adds the id, tenant, source and audit fields).</summary>
public sealed record NewGrant(string UserId, string Permission, string Scope, DateTimeOffset? ValidFrom = null, DateTimeOffset? ValidTo = null);

/// <summary>
/// What the caller (or another user) may do right now in the current tenant: grants filtered by time, plus platform
/// roles. Scoped; inject it into module services. Cached per user and tenant until the next grant starts or ends, and
/// cleared on every replica when grants change.
/// </summary>
public interface IAccessScopes
{
    /// <summary>The caller's <c>sub</c>, or null when anonymous or outside a request.</summary>
    string? UserId { get; }

    /// <summary>The caller holds the permission in some scope (or tenant-wide, or through a platform role).</summary>
    Task<bool> HasPermissionAsync(string permission, CancellationToken ct = default);

    /// <summary>The caller holds the permission for a resource with these scopes (e.g. its press and category).</summary>
    Task<bool> HasPermissionAsync(string permission, IReadOnlyCollection<string> resourceScopes, CancellationToken ct = default);

    /// <summary>
    /// The scopes the caller holds the permission in, for list filters. Contains <see cref="AccessScope.Tenant"/> when it
    /// is tenant-wide; empty when not at all.
    /// </summary>
    Task<IReadOnlyList<string>> ScopesAsync(string permission, CancellationToken ct = default);

    /// <summary>Every permission the caller holds now in the current tenant (for <c>/me</c>).</summary>
    Task<IReadOnlyCollection<string>> PermissionsAsync(CancellationToken ct = default);

    /// <summary>Another user's right, e.g. the assignee of an article must be an Editor on an active shift.</summary>
    Task<bool> UserHasPermissionAsync(string userId, string permission, IReadOnlyCollection<string> resourceScopes, CancellationToken ct = default);
}

/// <summary>
/// Grants of the current tenant (scoped). Writers name their source; every write clears the affected users' cached
/// rights on every replica.
/// </summary>
public interface IGrantStore
{
    Task<IReadOnlyList<AccessGrant>> ListAsync(string? userId = null, string? source = null, CancellationToken ct = default);

    Task<AccessGrant> AddAsync(NewGrant grant, string source = GrantSources.Standing, CancellationToken ct = default);

    /// <summary>Removes one grant; false when it does not exist in this tenant.</summary>
    Task<bool> RevokeAsync(Guid id, CancellationToken ct = default);

    /// <summary>Ends a user's grants of a source at <paramref name="at"/> (check-out); returns how many were shortened.</summary>
    Task<int> EndAsync(string userId, string source, DateTimeOffset at, CancellationToken ct = default);

    /// <summary>Replaces every grant of a source with <paramref name="grants"/> in one transaction (publishing a rota).</summary>
    Task ReplaceSourceAsync(string source, IReadOnlyCollection<NewGrant> grants, CancellationToken ct = default);
}

/// <summary>A module's declared permissions, as the catalog has them.</summary>
public sealed record ModulePermissionSet(string ModuleId, string ModuleName, IReadOnlyList<PermissionDefinition> Permissions);

/// <summary>Every permission known to the platform: the platform's own and those declared by installed modules.</summary>
public interface IPermissionCatalog
{
    Task<IReadOnlyList<ModulePermissionSet>> ListAsync(CancellationToken ct = default);
}
