using Blazored.LocalStorage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication.Internal;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.ModularBlazor.Abstractions.Auth;
using soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;
using soft.square.net.ModularBlazor.Infrastructure.Http;
using soft.square.net.Share.All.Authorization;
using System.Globalization;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth;

public static class Extensions
{
    /// <summary>
    /// Two API clients over the same base address: <c>IApiClient</c> (token + tenant headers) and the keyed
    /// <c>[FromKeyedServices(ApiClientNames.Anonymous)] IApiClient</c> (no token: core manifest, sign-in).
    /// </summary>
    public static IServiceCollection AddApiClients(this IServiceCollection services, string apiBaseUrl)
    {
        void Configure(HttpClient client)
        {
            client.BaseAddress = new Uri(apiBaseUrl);
            var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            if (!string.IsNullOrWhiteSpace(language) && language != "iv")
                client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(language);
        }

        services.AddTransient<JwtAuthenticationHeaderHandler>();
        services.AddHttpClient(ApiClientNames.Anonymous, Configure);
        services.AddHttpClient(ApiClientNames.Authenticated, Configure)
                .AddHttpMessageHandler<JwtAuthenticationHeaderHandler>();

        // Singletons on purpose: the host validates scopes in Development, and ModuleManager (a singleton) needs these.
        services.AddSingleton<IApiClient>(sp =>
            new ApiClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(ApiClientNames.Authenticated)));
        services.AddKeyedSingleton<IApiClient>(ApiClientNames.Anonymous, (sp, _) =>
            new ApiClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(ApiClientNames.Anonymous)));

        services.AddSingleton<IModuleAdminApi, ModuleAdminApi>();

        return services;
    }

    public static IServiceCollection AddAuthentication(this IServiceCollection services, IConfiguration config)
    {
        services.AddBlazoredLocalStorageAsSingleton();

        services.AddSingleton<JwtAuthenticationService>()
                .AddSingleton<AuthenticationStateProvider>(sp => sp.GetRequiredService<JwtAuthenticationService>())
                .AddSingleton<IAuthenticationService>(sp => sp.GetRequiredService<JwtAuthenticationService>())
                .AddSingleton<IAccessTokenProvider>(sp => sp.GetRequiredService<JwtAuthenticationService>())
                .AddSingleton<IAccessTokenProviderAccessor, AccessTokenProviderAccessor>()
                .AddSingleton<ICurrentUserService, CurrentUserService>();

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
