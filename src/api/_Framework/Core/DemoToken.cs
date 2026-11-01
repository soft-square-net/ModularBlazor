namespace soft.square.net.ModularBlazor.Core;

/// <summary>
/// DEMO ONLY: a token that is just "demo-" + role. Replace with JWT/OIDC issued and validated by
/// your identity provider; nothing here is secure.
/// </summary>
public static class DemoToken
{
    private const string BearerPrefix = "Bearer ";
    private const string TokenPrefix = "demo-";

    public static string Issue(string role) => TokenPrefix + role;

    /// <summary>Reads the role from an "Authorization: Bearer demo-{role}" header value.</summary>
    public static bool TryGetRole(string? authorizationHeader, out string role)
    {
        role = "";
        if (authorizationHeader is null) return false;

        var prefix = BearerPrefix + TokenPrefix;
        if (!authorizationHeader.StartsWith(prefix, StringComparison.Ordinal)) return false;

        role = authorizationHeader[prefix.Length..];
        return role.Length > 0;
    }
}
