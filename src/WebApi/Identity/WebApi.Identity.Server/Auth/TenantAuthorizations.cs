using System.Security.Claims;
using System.Text.Json;
using OpenIddict.Abstractions;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace soft.square.net.WebApi.Identity.Server.Auth;

/// <summary>
/// Binds every user sign-in to one tenant through an OpenIddict ad-hoc authorization carrying a <c>tenant</c>
/// property. Codes and refresh tokens hang off that authorization, so revoking it (membership removed or suspended)
/// makes every refresh token of that user in that tenant unusable at once.
/// </summary>
public sealed class TenantAuthorizations(IOpenIddictAuthorizationManager authorizations, IOpenIddictTokenManager tokens)
{
    private const string TenantProperty = "tenant";

    public async Task<string> CreateAsync(ClaimsIdentity identity, string applicationId, string userId, string? tenantId, CancellationToken ct)
    {
        var descriptor = new OpenIddictAuthorizationDescriptor
        {
            ApplicationId = applicationId,
            Subject = userId,
            Type = AuthorizationTypes.AdHoc,
            Status = Statuses.Valid,
            CreationDate = DateTimeOffset.UtcNow,
            Principal = new ClaimsPrincipal(identity),
        };
        descriptor.Scopes.UnionWith(identity.GetScopes());
        if (tenantId is not null)
            descriptor.Properties[TenantProperty] = JsonSerializer.SerializeToElement(tenantId);

        var authorization = await authorizations.CreateAsync(descriptor, ct);
        return (await authorizations.GetIdAsync(authorization, ct))!;
    }

    /// <summary>Revokes the user's authorizations (and their codes and refresh tokens) for one tenant. Returns how many.</summary>
    public async Task<int> RevokeAsync(string userId, string tenantId, CancellationToken ct)
    {
        var revoked = 0;
        await foreach (var authorization in authorizations.FindBySubjectAsync(userId, ct))
        {
            var properties = await authorizations.GetPropertiesAsync(authorization, ct);
            if (!properties.TryGetValue(TenantProperty, out var tenant) || tenant.ValueKind != JsonValueKind.String ||
                !string.Equals(tenant.GetString(), tenantId, StringComparison.Ordinal))
                continue;

            var id = await authorizations.GetIdAsync(authorization, ct);
            await tokens.RevokeByAuthorizationIdAsync(id!, ct);
            if (await authorizations.TryRevokeAsync(authorization, ct)) revoked++;
        }
        return revoked;
    }
}
