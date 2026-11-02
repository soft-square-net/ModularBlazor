using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

/// <summary>
/// A key for calling the API without a sign-in ("X-API-Key" header). It acts as its owner: the owner's roles and
/// permissions apply. Only the key's hash is stored.
/// </summary>
public sealed class ApiKey : AuditableAggregateRoot<Guid>
{
    private ApiKey() { } // EF Core

    public string Name { get; private set; } = "";

    /// <summary>The first characters of the key, to recognise it in a list.</summary>
    public string KeyPrefix { get; private set; } = "";

    public string KeyHash { get; private set; } = "";
    public Guid OwnerUserId { get; private set; }
    public DateTime? ExpiresUtc { get; private set; }
    public DateTime? LastUsedUtc { get; private set; }
    public DateTime? RevokedUtc { get; private set; }

    public static ApiKey Create(string name, string keyPrefix, string keyHash, Guid ownerUserId, DateTime? expiresUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return new ApiKey
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            KeyPrefix = keyPrefix,
            KeyHash = keyHash,
            OwnerUserId = ownerUserId,
            ExpiresUtc = expiresUtc
        };
    }

    public bool IsValid(DateTime utcNow) => RevokedUtc is null && (ExpiresUtc is null || ExpiresUtc > utcNow);

    public void Revoke(DateTime utcNow) => RevokedUtc ??= utcNow;

    /// <summary>Records a use; only touches the row when the last recorded use is more than 5 minutes old.</summary>
    public bool MarkUsed(DateTime utcNow)
    {
        if (LastUsedUtc is { } last && utcNow - last < TimeSpan.FromMinutes(5)) return false;

        LastUsedUtc = utcNow;
        return true;
    }
}
