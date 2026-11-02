using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.ApiKeys;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;

/// <summary>Looks an "X-API-Key" up (by hash) in the current tenant's database; the key stands for its owner.</summary>
public sealed class ApiKeyValidator(
    IRepository<ApiKey> keys, IReadRepository<User> users, UserAccessResolver access, TimeProvider clock) : IApiKeyValidator
{
    public async Task<ApiKeyIdentity?> ValidateAsync(string apiKey, CancellationToken cancellationToken = default)
    {
        if (!apiKey.StartsWith(ApiKeyFormat.Prefix, StringComparison.Ordinal)) return null;

        var now = clock.GetUtcNow().UtcDateTime;
        var key = await keys.FirstOrDefaultAsync(new ApiKeyByHashSpec(Hashing.Sha256Hex(apiKey)), cancellationToken);
        if (key is null || !key.IsValid(now)) return null;

        var owner = await users.FirstOrDefaultAsync(new UserWithRolesSpec(key.OwnerUserId), cancellationToken);
        if (owner is null || !owner.IsActive) return null;

        if (key.MarkUsed(now))
            await keys.SaveChangesAsync(cancellationToken);

        var (roles, permissions) = await access.ResolveAsync(owner, cancellationToken);
        return new ApiKeyIdentity(owner.Id.ToString(), owner.UserName, owner.Email, roles, permissions);
    }
}
