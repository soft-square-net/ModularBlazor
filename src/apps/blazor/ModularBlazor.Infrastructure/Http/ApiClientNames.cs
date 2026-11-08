namespace soft.square.net.ModularBlazor.Infrastructure.Http;

/// <summary>Names of the HttpClients that talk to the API.</summary>
public static class ApiClientNames
{
    /// <summary>Sends the bearer token (when there is one) and the tenant header. For everything after sign-in.</summary>
    public const string Authenticated = "ModularBlazor.API";

    /// <summary>No token handler. For sign-in, token refresh and the public core manifest; it also keeps the
    /// token service free of a dependency cycle (token service -> client -> handler -> token service).</summary>
    public const string Anonymous = "ModularBlazor.API.Anonymous";
}
