using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;

namespace soft.square.net.ModularBlazor.Infrastructure.Security;

public static class SecurityExtensions
{
    private const string SmartScheme = "Smart";

    /// <summary>
    /// Two authentication schemes, picked per request: "Authorization: Bearer {jwt}" (JwtBearer) or
    /// "X-API-Key: {key}" (ApiKey). Plus permission-based authorization (see RequirePermission).
    /// </summary>
    public static IServiceCollection AddSecurity(this IServiceCollection services, IConfiguration configuration)
    {
        var jwt = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
        if (jwt.SigningKey.Length < 32)
            throw new InvalidOperationException("Jwt:SigningKey must be at least 32 characters.");

        services.AddOptions<JwtOptions>().Bind(configuration.GetSection(JwtOptions.SectionName));

        services.AddAuthentication(options =>
            {
                options.DefaultScheme = SmartScheme;
                options.DefaultChallengeScheme = SmartScheme;
            })
            .AddPolicyScheme(SmartScheme, "JWT bearer or API key", options =>
                options.ForwardDefaultSelector = context =>
                    context.Request.Headers.ContainsKey(ApiKeyDefaults.HeaderName)
                        ? ApiKeyDefaults.Scheme
                        : JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false; // claims keep their short names (sub, role, permission, tenant)
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = ClaimNames.Name,
                    RoleClaimType = ClaimNames.Role
                };

                // A token is only good for the tenant it was issued for.
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        var current = context.HttpContext.RequestServices.GetRequiredService<ICurrentTenant>().Id;
                        var issuedFor = context.Principal?.FindFirst(ClaimNames.Tenant)?.Value;
                        if (!string.Equals(current, issuedFor, StringComparison.OrdinalIgnoreCase))
                            context.Fail("The token was issued for another tenant.");

                        return Task.CompletedTask;
                    }
                };
            })
            .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(ApiKeyDefaults.Scheme, _ => { });

        services.AddAuthorization();
        services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

        return services;
    }

    /// <summary>Authentication and authorization. Add after UseMultiTenant (tokens are checked against the tenant).</summary>
    public static IApplicationBuilder UseSecurity(this IApplicationBuilder app)
        => app.UseAuthentication().UseAuthorization();
}
