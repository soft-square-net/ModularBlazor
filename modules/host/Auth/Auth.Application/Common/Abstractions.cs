using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;

/// <summary>Hashes and checks passwords. Implemented in Infrastructure.</summary>
public interface IPasswordService
{
    string Hash(string password);
    bool Verify(string passwordHash, string password);
}

public sealed record AccessToken(string Token, DateTime ExpiresUtc);

/// <summary>Creates signed access tokens (JWT). Implemented in Infrastructure.</summary>
public interface ITokenService
{
    int RefreshTokenDays { get; }

    AccessToken CreateAccessToken(User user, IReadOnlyCollection<string> roles, IReadOnlyCollection<string> permissions);
}

public static class Hashing
{
    public static string Sha256Hex(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    /// <summary>A random URL-safe secret (refresh tokens, API keys).</summary>
    public static string NewSecret(int byteCount = 32) => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(byteCount));
}

/// <summary>What a user may do: role names and the union of the permissions of those roles.</summary>
public sealed class UserAccessResolver(IReadRepository<Role> roles)
{
    public async Task<(IReadOnlyList<string> Roles, IReadOnlyList<string> Permissions)> ResolveAsync(
        User user, CancellationToken cancellationToken)
    {
        var roleIds = user.UserRoles.Select(r => r.RoleId).ToList();
        if (roleIds.Count == 0) return ([], []);

        var list = await roles.ListAsync(new RolesWithPermissionsByIdsSpec(roleIds), cancellationToken);
        return (
            list.Select(r => r.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList(),
            list.SelectMany(r => r.Permissions.Select(p => p.Permission)).Distinct().OrderBy(p => p, StringComparer.Ordinal).ToList());
    }
}
