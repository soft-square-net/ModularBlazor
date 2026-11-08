using Microsoft.AspNetCore.Components.Authorization;
using soft.square.net.ModularBlazor.Abstractions.Auth;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth;

/// <summary>The signed-in user as modules see it. Cached until the authentication state changes.</summary>
public sealed class CurrentUserService : ICurrentUserService
{
    private readonly AuthenticationStateProvider _provider;
    private UserInfo? _cached;

    public event Action? Changed;

    public CurrentUserService(AuthenticationStateProvider provider)
    {
        _provider = provider;
        _provider.AuthenticationStateChanged += _ =>
        {
            _cached = null;
            Changed?.Invoke();
        };
    }

    public async Task<UserInfo?> GetUserInfoAsync()
    {
        if (_cached is not null) return _cached;

        var user = (await _provider.GetAuthenticationStateAsync()).User;
        if (user.Identity?.IsAuthenticated is not true) return null;

        try
        {
            return _cached = UserInfo.FromClaimsPrincipal(user);
        }
        catch (InvalidOperationException)
        {
            return null; // a token without a "sub" claim is not a usable session
        }
    }
}
