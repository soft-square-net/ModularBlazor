namespace soft.square.net.ModularBlazor.Abstractions;

/// <summary>Named HttpClients the host registers for modules: <c>IHttpClientFactory.CreateClient(HttpClientNames.WebApi)</c>.</summary>
public static class HttpClientNames
{
  /// <summary>
  /// The WebApi gateway (YARP in front of every pool), with the signed-in user's OpenIddict access token on every request.
  /// Registered by ModularBlazor.BlzWebClient; its base address is the gateway, so generated clients use relative urls.
  /// </summary>
  public const string WebApi = "WebApi";

  /// <summary>
  /// The OpenIddict identity service itself (the OIDC authority), with the same access token: its admin API, e.g.
  /// /api/admin/tenants/{tenant}/members. Registered by ModularBlazor.BlzWebClient; base address = the authority.
  /// </summary>
  public const string Identity = "Identity";
}
