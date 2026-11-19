using Microsoft.Extensions.Configuration;
using soft.square.net.ModularBlazor.BlzWebClient.Auth;
using soft.square.net.WebApi.Client;

namespace soft.square.net.ModularBlazor.BlzWebClient.Services;

/// <summary>
/// The WebApi host's module management API (WebApi.Client, generated from src/WebApi/openapi/webapi.json) behind the
/// YARP gateway, with the signed-in user's access token. It replaces the old IModuleAdminApi, which called the obsolete
/// api/ModularBlazor.Host.
/// Every pool has its own /api/admin/modules (the module catalog is shared, and lifecycle changes are broadcast to every
/// replica). Through the gateway's catch-all route the call reaches the core pool; the lab gateway also exposes each pool
/// at /pools/{pool}/..., which <see cref="Modules(string?)"/> uses when a pool is named.
/// </summary>
public sealed class HostModulesApi(IHttpClientFactory httpClients, IConfiguration configuration)
{
    /// <summary>Pools the gateway exposes under /pools/{pool} (wwwroot/appsettings.json "WebApi:Pools").</summary>
    public IReadOnlyList<string> Pools { get; } =
        configuration.GetSection("WebApi:Pools").Get<string[]>() ?? [];

    public ModulesClient Modules(string? pool = null) => new(Http(pool));

    public PoolClient Pool(string? pool = null) => new(Http(pool));

    public HealthClient Health(string? pool = null) => new(Http(pool));

    private HttpClient Http(string? pool)
    {
        var http = httpClients.CreateClient(AuthServiceExtensions.WebApiClient);
        if (!string.IsNullOrWhiteSpace(pool))
            http.BaseAddress = new Uri(http.BaseAddress!, $"pools/{Uri.EscapeDataString(pool)}/");
        return http;
    }
}
