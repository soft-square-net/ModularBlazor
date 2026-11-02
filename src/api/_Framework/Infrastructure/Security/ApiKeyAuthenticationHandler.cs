using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Security;

public static class ApiKeyDefaults
{
    public const string Scheme = "ApiKey";
    public const string HeaderName = "X-API-Key";
}

/// <summary>Authenticates "X-API-Key: {key}" against the current tenant's keys; the request acts as the key's owner.</summary>
internal sealed class ApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeyDefaults.HeaderName, out var header) || string.IsNullOrWhiteSpace(header))
            return AuthenticateResult.NoResult();

        var validator = Context.RequestServices.GetRequiredService<IApiKeyValidator>();
        var identity = await validator.ValidateAsync(header.ToString().Trim(), Context.RequestAborted);
        if (identity is null)
            return AuthenticateResult.Fail("Invalid API key.");

        var claims = new List<Claim>
        {
            new(ClaimNames.Subject, identity.UserId),
            new(ClaimNames.Name, identity.UserName),
            new(ClaimNames.Tenant, Context.RequestServices.GetRequiredService<ICurrentTenant>().Id)
        };
        if (!string.IsNullOrEmpty(identity.Email)) claims.Add(new Claim(ClaimNames.Email, identity.Email));
        claims.AddRange(identity.Roles.Select(r => new Claim(ClaimNames.Role, r)));
        claims.AddRange(identity.Permissions.Select(p => new Claim(ClaimNames.Permission, p)));

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name, ClaimNames.Name, ClaimNames.Role));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
    }
}
