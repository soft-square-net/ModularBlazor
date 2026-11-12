using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OpenIddict.Abstractions;
using soft.square.net.WebApi.Identity.Server.Data;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace soft.square.net.WebApi.Identity.Server.Auth;

/// <summary>Claim names and values shared with the WebApi host (keep in step with its JwtBearer setup).</summary>
public static class IdentityClaims
{
    public const string Tenant = "tenant";
    public const string Amr = "amr";
    /// <summary>The resource server (JWT <c>aud</c>) every access token is issued for.</summary>
    public const string Audience = "modular-webapi";
    /// <summary>Scope that asks for an access token for <see cref="Audience"/>.</summary>
    public const string ApiScope = "api";
    /// <summary>Platform roles; tenant roles are memberships and never go into the token.</summary>
    public const string PlatformAdmin = "platform-admin";
    public static readonly string[] PlatformRoles = [PlatformAdmin];
}

/// <summary>Why a token for a user and tenant is refused.</summary>
public sealed record IssueRefusal(string Error, string Description);

/// <summary>
/// Builds the principal behind every user token (authorization code and refresh) and enforces the tenant rules:
/// an Active membership, the tenant's security policy (RequireMfa), and the claims allow-list.
/// </summary>
public sealed class TokenIssuer(IdentityDb db, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn)
{
    /// <summary>
    /// Checks that <paramref name="user"/> may get a token for <paramref name="tenantId"/> (null = platform token,
    /// only for users with a platform role) given how they signed in (<paramref name="amr"/>).
    /// </summary>
    public async Task<IssueRefusal?> CheckAsync(ApplicationUser user, string? tenantId, IReadOnlyCollection<string> amr, CancellationToken ct)
    {
        if (!await signIn.CanSignInAsync(user) || await users.IsLockedOutAsync(user))
            return new(Errors.AccessDenied, "The account is locked or may not sign in.");

        if (tenantId is null)
        {
            var roles = await users.GetRolesAsync(user);
            return roles.Any(r => IdentityClaims.PlatformRoles.Contains(r))
                ? null
                : new(Errors.InvalidRequest, "A tenant is required: pass the 'tenant' parameter or a 'tenant:<id>' login_hint.");
        }

        var membership = await db.TenantMemberships.AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == user.Id && m.TenantId == tenantId, ct);
        if (membership is null)
            return new(Errors.AccessDenied, $"The account is not a member of tenant '{tenantId}'.");
        if (membership.Status != MembershipStatus.Active)
            return new(Errors.AccessDenied, $"The membership in tenant '{tenantId}' is {membership.Status.ToString().ToLowerInvariant()}, not active.");

        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId, ct);
        if (tenant?.RequireMfa == true)
        {
            // Policy hook: enrolment and the two-factor sign-in step come later; the flag is enforced now.
            if (!await users.GetTwoFactorEnabledAsync(user))
                return new(Errors.AccessDenied, $"mfa_required: Tenant '{tenantId}' requires multi-factor authentication and this account has no MFA enrolled. Enrol MFA, then sign in again.");
            if (!amr.Contains("mfa"))
                return new(Errors.AccessDenied, $"mfa_required: Tenant '{tenantId}' requires multi-factor authentication. Sign in again with your second factor.");
        }

        return null;
    }

    /// <summary>
    /// The identity for an access/identity token: sub, tenant, role (platform roles only), name, email, amr.
    /// Never permissions, presses, categories or shifts.
    /// </summary>
    public async Task<ClaimsIdentity> CreateIdentityAsync(ApplicationUser user, string? tenantId, IReadOnlyCollection<string> amr,
        IEnumerable<string> scopes, CancellationToken ct)
    {
        var identity = new ClaimsIdentity(
            authenticationType: TokenValidationParameters.DefaultAuthenticationType,
            nameType: Claims.Name, roleType: Claims.Role);

        var name = user.DisplayName ?? user.UserName;
        if (tenantId is not null)
        {
            var profile = await db.TenantProfiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == user.Id && p.TenantId == tenantId, ct);
            name = profile?.DisplayName ?? name;
            identity.SetClaim(IdentityClaims.Tenant, tenantId);
        }

        identity.SetClaim(Claims.Subject, user.Id)
                .SetClaim(Claims.Name, name)
                .SetClaim(Claims.Email, user.Email)
                .SetClaims(Claims.Role, [.. (await users.GetRolesAsync(user)).Where(r => IdentityClaims.PlatformRoles.Contains(r))]);
        // amr is a JSON array (RFC 8176), even with one value.
        identity.AddClaim(new Claim(IdentityClaims.Amr, JsonSerializer.Serialize(amr), JsonClaimValueTypes.JsonArray));

        identity.SetScopes(scopes);
        identity.SetResources(IdentityClaims.Audience);
        identity.SetDestinations(GetDestinations);
        return identity;
    }

    public static IReadOnlyCollection<string> ReadAmr(ClaimsPrincipal principal)
    {
        var values = new List<string>();
        foreach (var claim in principal.FindAll(IdentityClaims.Amr))
        {
            if (claim.ValueType == JsonClaimValueTypes.JsonArray)
                values.AddRange(JsonSerializer.Deserialize<string[]>(claim.Value) ?? []);
            else values.Add(claim.Value);
        }
        return values.Count == 0 ? ["pwd"] : values.Distinct().ToArray();
    }

    private static IEnumerable<string> GetDestinations(Claim claim)
    {
        switch (claim.Type)
        {
            case Claims.Name or Claims.Email:
                yield return Destinations.AccessToken;
                if (claim.Subject!.HasScope(claim.Type == Claims.Name ? Scopes.Profile : Scopes.Email))
                    yield return Destinations.IdentityToken;
                yield break;
            case Claims.Role or IdentityClaims.Tenant or IdentityClaims.Amr or Claims.Subject:
                yield return Destinations.AccessToken;
                yield return Destinations.IdentityToken;
                yield break;
            // OpenIddict's security stamp and anything else stays out of the tokens.
            default:
                yield break;
        }
    }
}
