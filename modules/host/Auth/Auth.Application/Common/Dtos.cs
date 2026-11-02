using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;

public sealed record TokenResult(string AccessToken, DateTime AccessTokenExpiresUtc, string RefreshToken, DateTime RefreshTokenExpiresUtc);

public sealed record UserDto(Guid Id, string UserName, string Email, string? FirstName, string? LastName, bool IsActive, DateTime? LastLoginUtc);

public sealed record UserDetailDto(UserDto User, IReadOnlyList<string> Roles);

public sealed record RoleDto(Guid Id, string Name, string? Description, bool IsSystem);

public sealed record RoleDetailDto(RoleDto Role, IReadOnlyList<string> Permissions);

public sealed record ApiKeyDto(
    Guid Id, string Name, string KeyPrefix, Guid OwnerUserId,
    DateTime? ExpiresUtc, DateTime? LastUsedUtc, DateTime? RevokedUtc, DateTime CreatedOnUtc);

/// <summary>Returned once, when a key is created: the key itself is not stored and cannot be shown again.</summary>
public sealed record CreatedApiKeyDto(ApiKeyDto ApiKey, string Key);

public static class Mapping
{
    public static UserDto ToDto(this User u)
        => new(u.Id, u.UserName, u.Email, u.FirstName, u.LastName, u.IsActive, u.LastLoginUtc);

    public static RoleDto ToDto(this Role r) => new(r.Id, r.Name, r.Description, r.IsSystem);

    public static ApiKeyDto ToDto(this ApiKey k)
        => new(k.Id, k.Name, k.KeyPrefix, k.OwnerUserId, k.ExpiresUtc, k.LastUsedUtc, k.RevokedUtc, k.CreatedOnUtc);
}
