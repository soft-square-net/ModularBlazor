namespace soft.square.net.ModularBlazor.Core.Abstractions;

/// <summary>Who an API key stands for: its owner, with the owner's roles and permissions.</summary>
public sealed record ApiKeyIdentity(
    string UserId, string UserName, string? Email, IReadOnlyList<string> Roles, IReadOnlyList<string> Permissions);

/// <summary>Checks an API key against the current tenant's database. Implemented by the Auth module.</summary>
public interface IApiKeyValidator
{
    /// <summary>The key's identity, or null when the key is unknown, revoked, expired or its owner is inactive.</summary>
    Task<ApiKeyIdentity?> ValidateAsync(string apiKey, CancellationToken cancellationToken = default);
}
