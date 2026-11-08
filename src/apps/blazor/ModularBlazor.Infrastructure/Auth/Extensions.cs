using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication.Internal;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions.Auth;
using soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;
using soft.square.net.Share.All.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth;

public static class Extensions
{
    public static IServiceCollection AddAuthentication(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<AuthenticationStateProvider, JwtAuthenticationService>()
                .AddScoped(sp => (IAuthenticationService)sp.GetRequiredService<AuthenticationStateProvider>())
                .AddScoped(sp => (IAccessTokenProvider)sp.GetRequiredService<AuthenticationStateProvider>())
                .AddScoped<IAccessTokenProviderAccessor, AccessTokenProviderAccessor>()
                .AddScoped<JwtAuthenticationHeaderHandler>();

        services.AddAuthorizationCore(RegisterPermissionClaims);
        services.AddCascadingAuthenticationState();
        return services;
    }


    private static void RegisterPermissionClaims(AuthorizationOptions options)
    {
        foreach (var permission in UsrPermissions.Instance.All.Select(p => p.Name))
        {
            options.AddPolicy(permission, policy => policy.RequireClaim(UsrClaims.Permission, permission));
        }
    }
}
