using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication.Internal;
using soft.square.net.Share.All.Authorization;
using System.Net;
using System.Net.Http.Headers;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;

/// <summary>
/// Adds "Authorization: Bearer" and "X-Tenant" (the tenant the token was issued for) to API calls when someone is signed in.
/// Anonymous calls (the core module manifest, sign-in) pass through untouched - this handler never redirects before a request.
/// A 401 for a request that carried a token means the session is over, and only then is the user sent to the login page.
/// </summary>
public class JwtAuthenticationHeaderHandler : DelegatingHandler
{
    private const string TenantHeader = "X-Tenant";

    private readonly IAccessTokenProviderAccessor _tokenProviderAccessor;
    private readonly NavigationManager _navigation;

    public JwtAuthenticationHeaderHandler(IAccessTokenProviderAccessor tokenProviderAccessor, NavigationManager navigation)
    {
        _tokenProviderAccessor = tokenProviderAccessor;
        _navigation = navigation;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string? token = null;

        // The token endpoints (sign in, refresh, revoke) must never wait for a token: refresh itself would deadlock.
        if (request.RequestUri?.AbsolutePath.Contains("/identity/tokens", StringComparison.OrdinalIgnoreCase) is not true)
        {
            token = await _tokenProviderAccessor.TokenProvider.GetAccessTokenAsync();
            if (token is not null)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // A JWT only works for the tenant it was issued for, so send that tenant unless the caller chose one.
                if (!request.Headers.Contains(TenantHeader) && JwtParser.GetClaim(token, UsrClaims.Tenant) is { Length: > 0 } tenant)
                    request.Headers.TryAddWithoutValidation(TenantHeader, tenant);
            }
        }

        var response = await base.SendAsync(request, cancellationToken);

        if (token is not null && response.StatusCode == HttpStatusCode.Unauthorized)
        {
            try { _navigation.NavigateTo("login", replace: true); }
            catch (InvalidOperationException) { /* before the app has started there is no page to leave */ }
        }

        return response;
    }
}
