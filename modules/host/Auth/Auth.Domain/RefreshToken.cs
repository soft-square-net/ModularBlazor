using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

/// <summary>A refresh token (only its hash is stored). Each use replaces it with a new one.</summary>
public sealed class RefreshToken : AggregateRoot<Guid>
{
    private RefreshToken() { } // EF Core

    public Guid UserId { get; private set; }
    public string TokenHash { get; private set; } = "";
    public DateTime CreatedUtc { get; private set; }
    public DateTime ExpiresUtc { get; private set; }
    public DateTime? RevokedUtc { get; private set; }
    public string? ReplacedByTokenHash { get; private set; }

    public static RefreshToken Create(Guid userId, string tokenHash, DateTime utcNow, DateTime expiresUtc)
        => new() { Id = Guid.NewGuid(), UserId = userId, TokenHash = tokenHash, CreatedUtc = utcNow, ExpiresUtc = expiresUtc };

    public bool IsActive(DateTime utcNow) => RevokedUtc is null && ExpiresUtc > utcNow;

    public void Revoke(DateTime utcNow, string? replacedByTokenHash = null)
    {
        RevokedUtc ??= utcNow;
        ReplacedByTokenHash = replacedByTokenHash;
    }
}
