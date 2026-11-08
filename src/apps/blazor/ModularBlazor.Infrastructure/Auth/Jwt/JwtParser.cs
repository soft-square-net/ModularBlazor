using System.Security.Claims;
using System.Text.Json;

namespace soft.square.net.ModularBlazor.Infrastructure.Auth.Jwt;

/// <summary>Reads the claims out of a JWT payload. The signature is NOT checked: the server does that on every call.</summary>
public static class JwtParser
{
    /// <summary>Every payload property becomes a claim of the same name; arrays become one claim per item (role, permission).</summary>
    public static IReadOnlyList<Claim> Parse(string jwt)
    {
        var parts = jwt.Split('.');
        if (parts.Length < 2) throw new FormatException("Not a JWT.");

        using var document = JsonDocument.Parse(DecodeBase64Url(parts[1]));
        var claims = new List<Claim>();

        foreach (var property in document.RootElement.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.Array)
                foreach (var item in property.Value.EnumerateArray())
                    claims.Add(new Claim(property.Name, AsText(item)));
            else
                claims.Add(new Claim(property.Name, AsText(property.Value)));
        }

        return claims;
    }

    public static string? GetClaim(string jwt, string type)
    {
        try { return Parse(jwt).FirstOrDefault(c => c.Type == type)?.Value; }
        catch (Exception ex) when (ex is FormatException or JsonException) { return null; }
    }

    private static string AsText(JsonElement element)
        => element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" : element.ToString();

    private static byte[] DecodeBase64Url(string value)
    {
        var s = value.Trim().Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
