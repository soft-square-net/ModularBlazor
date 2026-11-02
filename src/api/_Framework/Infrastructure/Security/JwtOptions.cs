namespace soft.square.net.ModularBlazor.Infrastructure.Security;

/// <summary>Configuration section "Jwt".</summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "modularblazor";
    public string Audience { get; set; } = "modularblazor-api";

    /// <summary>At least 32 characters. Keep it out of source control: user-secrets or an environment variable (Jwt__SigningKey).</summary>
    public string SigningKey { get; set; } = "";

    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 7;
}
