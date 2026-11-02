using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;

/// <summary>
/// Signs JWT access tokens (HS256). Claims: sub, name, email, role (one per role), permission (one per
/// permission) and tenant. Role/permission changes reach a user's tokens when they next refresh.
/// </summary>
public sealed class JwtTokenService(IOptions<JwtOptions> options, ICurrentTenant tenant, TimeProvider clock) : ITokenService
{
    private readonly JwtOptions _options = options.Value;

    public int RefreshTokenDays => _options.RefreshTokenDays;

    public AccessToken CreateAccessToken(User user, IReadOnlyCollection<string> roles, IReadOnlyCollection<string> permissions)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var expires = now.AddMinutes(_options.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(ClaimNames.Subject, user.Id.ToString()),
            new(ClaimNames.Name, user.UserName),
            new(ClaimNames.Email, user.Email),
            new(ClaimNames.Tenant, tenant.Id)
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimNames.Role, r)));
        claims.AddRange(permissions.Select(p => new Claim(ClaimNames.Permission, p)));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey)), SecurityAlgorithms.HmacSha256)
        };

        return new AccessToken(new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}
