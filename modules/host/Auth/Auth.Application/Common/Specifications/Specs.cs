using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;

// ---- users ----

/// <summary>The user whose user name or email matches (case-insensitive), with roles.</summary>
public sealed class UserByLoginSpec : Specification<User>
{
    public UserByLoginSpec(string login)
    {
        var normalized = User.Normalize(login);
        Query.Where(u => u.NormalizedUserName == normalized || u.NormalizedEmail == normalized).Include(u => u.UserRoles);
    }
}

public sealed class UserByUserNameOrEmailSpec : Specification<User>
{
    public UserByUserNameOrEmailSpec(string userName, string email)
    {
        var name = User.Normalize(userName);
        var mail = User.Normalize(email);
        Query.Where(u => u.NormalizedUserName == name || u.NormalizedEmail == mail);
    }
}

public sealed class UserWithRolesSpec : Specification<User>
{
    public UserWithRolesSpec(Guid id) => Query.Where(u => u.Id == id).Include(u => u.UserRoles);
}

public sealed class UsersInRoleSpec : Specification<User>
{
    public UsersInRoleSpec(Guid roleId) => Query.Where(u => u.UserRoles.Any(r => r.RoleId == roleId));
}

public sealed class UsersByPaginationFilterSpec : EntitiesByPaginationFilterSpec<User, UserDto>
{
    /// <summary>The only properties a client may search or order users by (never the password hash).</summary>
    public static readonly string[] Fields =
        [nameof(User.UserName), nameof(User.Email), nameof(User.FirstName), nameof(User.LastName), nameof(User.IsActive), nameof(User.CreatedOnUtc), nameof(User.LastLoginUtc)];

    public UsersByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(u => new UserDto(u.Id, u.UserName, u.Email, u.FirstName, u.LastName, u.IsActive, u.LastLoginUtc));
}

// ---- roles ----

public sealed class RoleByIdSpec : Specification<Role>
{
    public RoleByIdSpec(Guid id) => Query.Where(r => r.Id == id).Include(r => r.Permissions);
}

public sealed class RoleByNameSpec : Specification<Role>
{
    public RoleByNameSpec(string name)
    {
        var normalized = Role.Normalize(name);
        Query.Where(r => r.NormalizedName == normalized);
    }
}

public sealed class RolesByNamesSpec : Specification<Role>
{
    public RolesByNamesSpec(IReadOnlyCollection<string> names)
    {
        var normalized = names.Select(Role.Normalize).ToList();
        Query.Where(r => normalized.Contains(r.NormalizedName));
    }
}

public sealed class RolesWithPermissionsByIdsSpec : Specification<Role>
{
    public RolesWithPermissionsByIdsSpec(IReadOnlyCollection<Guid> ids)
        => Query.Where(r => ids.Contains(r.Id)).Include(r => r.Permissions);
}

public sealed class RolesByPaginationFilterSpec : EntitiesByPaginationFilterSpec<Role, RoleDto>
{
    public static readonly string[] Fields = [nameof(Role.Name), nameof(Role.Description), nameof(Role.IsSystem), nameof(Role.CreatedOnUtc)];

    public RolesByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(r => new RoleDto(r.Id, r.Name, r.Description, r.IsSystem));
}

// ---- tokens and keys ----

public sealed class RefreshTokenByHashSpec : Specification<RefreshToken>
{
    public RefreshTokenByHashSpec(string tokenHash) => Query.Where(t => t.TokenHash == tokenHash);
}

public sealed class ApiKeyByIdSpec : Specification<ApiKey>
{
    public ApiKeyByIdSpec(Guid id) => Query.Where(k => k.Id == id);
}

public sealed class ApiKeyByHashSpec : Specification<ApiKey>
{
    public ApiKeyByHashSpec(string keyHash) => Query.Where(k => k.KeyHash == keyHash);
}

public sealed class ApiKeysByPaginationFilterSpec : EntitiesByPaginationFilterSpec<ApiKey, ApiKeyDto>
{
    public static readonly string[] Fields = [nameof(ApiKey.Name), nameof(ApiKey.KeyPrefix), nameof(ApiKey.CreatedOnUtc), nameof(ApiKey.ExpiresUtc)];

    public ApiKeysByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(k => new ApiKeyDto(k.Id, k.Name, k.KeyPrefix, k.OwnerUserId, k.ExpiresUtc, k.LastUsedUtc, k.RevokedUtc, k.CreatedOnUtc));
}
