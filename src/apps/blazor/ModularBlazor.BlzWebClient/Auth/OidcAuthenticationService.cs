using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.ModularBlazor.Abstractions.Auth;

namespace soft.square.net.ModularBlazor.BlzWebClient.Auth;

/// <summary>
/// <see cref="IAuthenticationService"/> over OpenID Connect: signing in is a redirect to the OpenIddict identity
/// service (Authorization Code + PKCE), which shows its own sign-in form and sends the browser back to
/// authentication/login-callback with a code. Passwords never reach this app, so the password-based
/// <see cref="LoginAsync"/> of the old JWT client is not supported.
/// </summary>
public sealed class OidcAuthenticationService : IAuthenticationService
{
    public const string LoginPath = "authentication/login";
    public const string LogoutPath = "authentication/logout";

    /// <summary>Authorization request parameter the identity service reads to bind the token to a tenant.</summary>
    public const string TenantParameter = "tenant";

    private readonly NavigationManager _navigation;

    public event Action? Changed;

    public OidcAuthenticationService(NavigationManager navigation, AuthenticationStateProvider provider)
    {
        _navigation = navigation;
        provider.AuthenticationStateChanged += _ => Changed?.Invoke();
    }

    /// <summary>Redirects to the identity service. <paramref name="tenant"/> asks for a token bound to that tenant.</summary>
    public void SignIn(string? returnUrl, string? tenant = null)
    {
        var request = new InteractiveRequestOptions
        {
            Interaction = InteractionType.SignIn,
            ReturnUrl = _navigation.ToAbsoluteUri(string.IsNullOrWhiteSpace(returnUrl) ? "" : returnUrl).ToString(),
        };
        if (!string.IsNullOrWhiteSpace(tenant)) request.TryAddAdditionalParameter(TenantParameter, tenant.Trim());
        _navigation.NavigateToLogin(LoginPath, request);
    }

    public void NavigateToExternalLogin(string returnUrl) => SignIn(returnUrl);

    public Task<bool> LoginAsync(string tenantId, LoginCommand request)
        => throw new NotSupportedException("Sign-in is a redirect to the identity service; call NavigateToExternalLogin.");

    public Task LogoutAsync()
    {
        // Ends the identity service session too, then comes back to authentication/logout-callback and on to /login.
        _navigation.NavigateToLogout(LogoutPath, "login");
        return Task.CompletedTask;
    }

    public Task ReLoginAsync(string returnUrl)
    {
        SignIn(returnUrl);
        return Task.CompletedTask;
    }
}
