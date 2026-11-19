using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions.Auth;

namespace soft.square.net.ModularBlazor.BlzWebClient.Auth;

public static class AuthServiceExtensions
{
    /// <summary>Named HttpClient for the YARP gateway, with the user's access token attached.</summary>
    public const string WebApiClient = soft.square.net.ModularBlazor.Abstractions.HttpClientNames.WebApi;

    /// <summary>
    /// OpenID Connect against the OpenIddict identity service (section "Oidc" of wwwroot/appsettings.json):
    /// Authorization Code + PKCE, the "api" scope for the WebApi audience, roles from the "role" claim.
    /// </summary>
    public static IServiceCollection AddOpenIddictAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOidcAuthentication(options =>
        {
            configuration.Bind("Oidc", options.ProviderOptions);
            options.ProviderOptions.ResponseType = "code";
            options.UserOptions.NameClaim = UserInfo.NameClaimType;
            options.UserOptions.RoleClaim = UserInfo.RoleClaimType;
        }).AddAccountClaimsPrincipalFactory<OidcClaimsPrincipalFactory>();

        // Scoped like the AuthenticationStateProvider the OIDC services register (one scope per app in WebAssembly).
        services.AddScoped<OidcAuthenticationService>();
        services.AddScoped<IAuthenticationService>(sp => sp.GetRequiredService<OidcAuthenticationService>());
        services.AddScoped<ICurrentUserService, CurrentUserService>();

        services.AddAuthorizationCore();
        services.AddCascadingAuthenticationState();

        // The identity service's own admin API (memberships), called with the same access token. The token is only
        // attached to requests for the authority.
        var authority = configuration["Oidc:Authority"];
        if (!string.IsNullOrWhiteSpace(authority))
        {
            var identity = new Uri(authority.EndsWith('/') ? authority : authority + "/");
            services.AddHttpClient(IdentityClient, client => client.BaseAddress = identity)
                .AddHttpMessageHandler(sp => sp.GetRequiredService<AuthorizationMessageHandler>()
                    .ConfigureHandler(authorizedUrls: [identity.ToString()]));
        }
        return services;
    }

    /// <summary>Named HttpClient for the identity service (Oidc:Authority), with the user's access token attached.</summary>
    public const string IdentityClient = soft.square.net.ModularBlazor.Abstractions.HttpClientNames.Identity;

    /// <summary>
    /// The gateway's HttpClient ("WebApi"): base address WebApi:BaseUrl, bearer token from the identity service on
    /// every request to that origin. Modules can use it too: IHttpClientFactory.CreateClient("WebApi").
    /// </summary>
    public static IServiceCollection AddWebApiClient(this IServiceCollection services, string gatewayBaseUrl)
    {
        var baseAddress = new Uri(gatewayBaseUrl.EndsWith('/') ? gatewayBaseUrl : gatewayBaseUrl + "/");
        services.AddHttpClient(WebApiClient, client => client.BaseAddress = baseAddress)
            .AddHttpMessageHandler(sp => sp.GetRequiredService<AuthorizationMessageHandler>()
                .ConfigureHandler(authorizedUrls: [baseAddress.ToString()]));
        // Same gateway, no token: the anonymous client manifest and public module files (before sign-in, the
        // AuthorizationMessageHandler would throw for want of a token).
        services.AddHttpClient(WebApiPublicClient, client => client.BaseAddress = baseAddress);
        return services;
    }

    /// <summary>Named HttpClient for the gateway without a token (anonymous endpoints).</summary>
    public const string WebApiPublicClient = "WebApi.Public";
}
