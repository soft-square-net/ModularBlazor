using System.Security.Claims;
using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.ModularBlazor.Abstractions.Auth;
using soft.square.net.ModularBlazor.Infrastructure.Http;
using soft.square.net.ModularBlazor.Infrastructure.Storage;
using soft.square.net.Share.All.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;

/// <summary>
/// Client side sign-in state, kept in the browser's local storage:
///   * signs in / refreshes / revokes through an API client WITHOUT the token handler (no dependency cycle),
///   * exposes the user as an AuthenticationStateProvider built from the access token's claims
///     (name, role, tenant and every "permission" claim the server put in the token),
///   * is the IAccessTokenProvider the HTTP handler asks for a fresh token (refreshing it a minute before expiry).
/// Registered as a singleton: one instance serves components and the HTTP handler alike.
/// </summary>
public sealed class JwtAuthenticationService : AuthenticationStateProvider, IAuthenticationService, IAccessTokenProvider
{
    private static readonly ClaimsPrincipal Anonymous = new(new ClaimsIdentity());

    private readonly SemaphoreSlim _refreshGate = new(1, 1);
    private readonly IApiClient _client;
    private readonly ILocalStorageService _localStorage;
    private readonly NavigationManager _navigation;

    public event Action? Changed;

    public JwtAuthenticationService(ILocalStorageService localStorage, IHttpClientFactory httpClients, NavigationManager navigation)
    {
        _localStorage = localStorage;
        _navigation = navigation;
        _client = new ApiClient(httpClients.CreateClient(ApiClientNames.Anonymous));
    }

    // ------------------------------------------------------------------ state

    public override async Task<AuthenticationState> GetAuthenticationStateAsync()
        => new(await ReadPrincipalAsync());

    private async Task<ClaimsPrincipal> ReadPrincipalAsync()
    {
        var token = await GetCachedAsync(StorageConstants.Local.AuthToken);
        if (string.IsNullOrWhiteSpace(token)) return Anonymous;

        try
        {
            // The token's own claim names ("name", "role") are what the identity uses, so IsInRole and Identity.Name work.
            return new ClaimsPrincipal(new ClaimsIdentity(
                JwtParser.Parse(token), "jwt", UserInfo.NameClaimType, UserInfo.RoleClaimType));
        }
        catch (Exception ex) when (ex is FormatException or System.Text.Json.JsonException)
        {
            await ClearCacheAsync(); // a damaged token is the same as no token
            return Anonymous;
        }
    }

    // ------------------------------------------------------------------ sign in / out

    public async Task<bool> LoginAsync(string tenantId, LoginCommand request)
    {
        TokenResult result;
        try
        {
            result = await _client.IssueTokenAsync(tenantId, request);
        }
        catch (ApiException ex) when (ex.StatusCode is 400 or 401)
        {
            return false; // wrong user name or password
        }

        if (string.IsNullOrWhiteSpace(result.AccessToken) || string.IsNullOrWhiteSpace(result.RefreshToken))
            return false;

        await CacheTokensAsync(result.AccessToken, result.RefreshToken);
        RaiseChanged();
        return true;
    }

    public async Task LogoutAsync()
    {
        await SignOutAsync();
        _navigation.NavigateTo("login");
    }

    public async Task ReLoginAsync(string returnUrl)
    {
        await SignOutAsync();
        _navigation.NavigateTo($"login?returnUrl={Uri.EscapeDataString(returnUrl.TrimStart('/'))}");
    }

    public void NavigateToExternalLogin(string returnUrl)
        => throw new NotSupportedException("Only the built-in user name / password sign-in is available.");

    private async Task SignOutAsync()
    {
        var refreshToken = await GetCachedAsync(StorageConstants.Local.RefreshToken);
        var tenant = await GetTenantAsync();

        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            try { await _client.RevokeTokenAsync(tenant, new RevokeRefreshTokenCommand { RefreshToken = refreshToken }); }
            catch { /* best effort: the local session ends either way */ }
        }

        await ClearCacheAsync();
        RaiseChanged();
    }

    // ------------------------------------------------------------------ access token (for the HTTP handler)

    public ValueTask<AccessTokenResult> RequestAccessToken(AccessTokenRequestOptions options) => RequestAccessToken();

    public async ValueTask<AccessTokenResult> RequestAccessToken()
    {
        // One refresh at a time; concurrent requests wait here and then find the new token.
        await _refreshGate.WaitAsync();
        try
        {
            var token = await GetCachedAsync(StorageConstants.Local.AuthToken);
            if (string.IsNullOrWhiteSpace(token)) return NeedsLogin();

            var principal = await ReadPrincipalAsync();
            if (principal.Identity?.IsAuthenticated is not true) return NeedsLogin();

            if (principal.GetExpiration() - DateTimeOffset.UtcNow <= TimeSpan.FromMinutes(1))
            {
                var refreshed = await TryRefreshAsync(token, principal.FindFirst(UsrClaims.Tenant)?.Value);
                if (refreshed is null)
                {
                    await ClearCacheAsync(); // refresh token expired or revoked: the session is over
                    RaiseChanged();
                    return NeedsLogin();
                }

                token = refreshed;
            }

            return new AccessTokenResult(AccessTokenResultStatus.Success, new AccessToken { Value = token }, string.Empty, default);
        }
        finally
        {
            _refreshGate.Release();
        }
    }

    private async Task<string?> TryRefreshAsync(string accessToken, string? tenant)
    {
        var refreshToken = await GetCachedAsync(StorageConstants.Local.RefreshToken);
        if (string.IsNullOrWhiteSpace(refreshToken)) return null;

        try
        {
            var result = await _client.RefreshTokenAsync(tenant, new RefreshTokenCommand { Token = accessToken, RefreshToken = refreshToken });
            await CacheTokensAsync(result.AccessToken, result.RefreshToken);
            return result.AccessToken;
        }
        catch (ApiException)
        {
            return null;
        }
    }

    private static AccessTokenResult NeedsLogin()
        => new(AccessTokenResultStatus.RequiresRedirect, new AccessToken(), "login", default);

    // ------------------------------------------------------------------ storage

    private void RaiseChanged()
    {
        Changed?.Invoke();
        NotifyAuthenticationStateChanged(GetAuthenticationStateAsync());
    }

    private async Task<string?> GetTenantAsync()
    {
        var token = await GetCachedAsync(StorageConstants.Local.AuthToken);
        return token is null ? null : JwtParser.GetClaim(token, UsrClaims.Tenant);
    }

    private async Task<string?> GetCachedAsync(string key)
    {
        try { return await _localStorage.GetItemAsStringAsync(key) is { } raw ? raw.Trim('"') : null; }
        catch { return null; }
    }

    private async ValueTask CacheTokensAsync(string accessToken, string refreshToken)
    {
        await _localStorage.SetItemAsStringAsync(StorageConstants.Local.AuthToken, accessToken);
        await _localStorage.SetItemAsStringAsync(StorageConstants.Local.RefreshToken, refreshToken);
    }

    private async Task ClearCacheAsync()
    {
        await _localStorage.RemoveItemAsync(StorageConstants.Local.AuthToken);
        await _localStorage.RemoveItemAsync(StorageConstants.Local.RefreshToken);
        await _localStorage.RemoveItemAsync(StorageConstants.Local.Permissions); // leftover of earlier versions
    }
}
