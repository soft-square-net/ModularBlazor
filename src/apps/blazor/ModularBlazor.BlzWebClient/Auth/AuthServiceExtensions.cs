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
        return services;
    }

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
        return services;
    }
}
