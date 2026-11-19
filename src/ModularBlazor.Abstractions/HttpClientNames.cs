namespace soft.square.net.ModularBlazor.Abstractions;

/// <summary>Named HttpClients the host registers for modules: <c>IHttpClientFactory.CreateClient(HttpClientNames.WebApi)</c>.</summary>
public static class HttpClientNames
{
  /// <summary>
  /// The WebApi gateway (YARP in front of every pool), with the signed-in user's OpenIddict access token on every request.
  /// Registered by ModularBlazor.BlzWebClient; its base address is the gateway, so generated clients use relative urls.
  /// </summary>
  public const string WebApi = "WebApi";
}
