using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication.Internal;

namespace soft.square.net.ModularBlazor.BlzWebClient.Auth;

/// <summary>
/// Builds the signed-in user from the OpenIddict id token / userinfo answer. A user with several roles gets one
/// "role" claim whose value is a JSON array (["platform-admin","..."]); the default factory keeps that as a single
/// claim, so IsInRole and UserInfo.Roles would not see the roles. They are split into one claim per role here.
/// </summary>
public sealed class OidcClaimsPrincipalFactory(IAccessTokenProviderAccessor accessor)
    : AccountClaimsPrincipalFactory<RemoteUserAccount>(accessor)
{
    public override async ValueTask<ClaimsPrincipal> CreateUserAsync(RemoteUserAccount account, RemoteAuthenticationUserOptions options)
    {
        var user = await base.CreateUserAsync(account, options);
        if (user.Identity is not ClaimsIdentity identity || !identity.IsAuthenticated) return user;

        foreach (var claim in identity.FindAll(options.RoleClaim ?? "role").ToList())
        {
            if (!claim.Value.TrimStart().StartsWith('[')) continue;
            identity.RemoveClaim(claim);
            try
            {
                foreach (var role in JsonSerializer.Deserialize<string[]>(claim.Value) ?? [])
                    identity.AddClaim(new Claim(claim.Type, role));
            }
            catch (JsonException)
            {
                identity.AddClaim(claim); // not an array after all: keep it as it was
            }
        }

        return user;
    }
}
