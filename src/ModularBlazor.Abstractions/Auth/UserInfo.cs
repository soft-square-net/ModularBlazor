using System.Security.Claims;

namespace soft.square.net.ModularBlazor.Abstractions.Auth;

/// <summary>What modules and layouts may know about the signed-in user (read from the access token).</summary>
public sealed class UserInfo
{
    public required string UserId { get; init; }
    public required string Name { get; init; }
    public string? Tenant { get; init; }
    public IReadOnlyList<string> Roles { get; init; } = [];

    public const string UserIdClaimType = "sub";
    public const string NameClaimType = "name";
    public const string RoleClaimType = "role";
    public const string TenantClaimType = "tenant";

    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.OrdinalIgnoreCase);

    public static UserInfo FromClaimsPrincipal(ClaimsPrincipal principal) =>
        new()
        {
            UserId = GetRequiredClaim(principal, UserIdClaimType),
            Name = principal.FindFirst(NameClaimType)?.Value ?? GetRequiredClaim(principal, UserIdClaimType),
            Tenant = principal.FindFirst(TenantClaimType)?.Value,
            Roles = principal.FindAll(RoleClaimType).Select(c => c.Value).ToArray(),
        };

    public ClaimsPrincipal ToClaimsPrincipal()
    {
        var claims = new List<Claim> { new(UserIdClaimType, UserId), new(NameClaimType, Name) };
        if (Tenant is not null) claims.Add(new(TenantClaimType, Tenant));
        claims.AddRange(Roles.Select(r => new Claim(RoleClaimType, r)));

        return new(new ClaimsIdentity(claims, nameof(UserInfo), NameClaimType, RoleClaimType));
    }

    private static string GetRequiredClaim(ClaimsPrincipal principal, string claimType) =>
        principal.FindFirst(claimType)?.Value ?? throw new InvalidOperationException($"Could not find required '{claimType}' claim.");
}
