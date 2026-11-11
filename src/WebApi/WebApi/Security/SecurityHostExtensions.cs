using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Modularity;
using soft.square.net.WebApi.Tenancy;

namespace soft.square.net.WebApi.Security;

public static class SecurityHostExtensions
{
    /// <summary>
    /// Authentication and authorization on every replica (the replica has the final say; see the auth design):
    /// <list type="bullet">
    /// <item>JWT bearer tokens from the identity service: <c>Auth:Authority</c> (OIDC discovery, JWKS) and
    /// <c>Auth:Audience</c> (default <c>modular-webapi</c>). Without an authority, the standard
    /// <c>Authentication:Schemes:Bearer</c> section applies, which <c>dotnet user-jwts</c> writes for development tokens.</item>
    /// <item>Fallback policy: every endpoint needs a signed-in caller unless it allows anonymous access.</item>
    /// <item>Permissions: <see cref="PermissionRequirement"/> evaluated against grants (server side, per tenant, time-windowed)
    /// and platform roles; <see cref="IAccessScopes"/> and <see cref="IGrantStore"/> for modules.</item>
    /// </list>
    /// </summary>
    public static IHostApplicationBuilder AddPlatformSecurity(this IHostApplicationBuilder builder, string brokerConnectionName)
    {
        var services = builder.Services;
        var configuration = builder.Configuration;

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false; // keep "sub", "role", "tenant" as issued
                options.TokenValidationParameters.NameClaimType = PlatformClaims.Name;
                options.TokenValidationParameters.RoleClaimType = PlatformClaims.Role;
                if (configuration["Auth:Authority"] is { Length: > 0 } authority)
                {
                    options.Authority = authority;
                    options.Audience = configuration["Auth:Audience"] ?? "modular-webapi";
                    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
                }
            });

        services.AddAuthorization(options =>
        {
            options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
        });
        services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddHttpContextAccessor();
        services.TryAddSingleton(TimeProvider.System);

        services.AddSingleton<PlatformRolePermissions>();
        services.AddSingleton<GrantCache>();
        services.AddScoped<IAccessScopes, AccessScopes>();
        services.AddScoped<IGrantStore, GrantStore>();
        services.AddSingleton<IPermissionCatalog, PermissionCatalog>();

        // Grants live in the tenant store when there is one (migrated with it), otherwise in memory (single local instance).
        if (!string.IsNullOrWhiteSpace(configuration.GetConnectionString(TenancyHostExtensions.StoreConnectionName)))
            services.AddScoped<IGrantRepository, EfGrantRepository>();
        else
            services.AddSingleton<IGrantRepository, InMemoryGrantRepository>();

        if (!string.IsNullOrWhiteSpace(configuration.GetConnectionString(brokerConnectionName)))
        {
            // The RabbitMQ client is registered by AddRuntimeModuleBroadcast (same connection name).
            services.AddSingleton<IGrantChangeBus, RabbitMqGrantChangeBus>();
            services.AddHostedService<GrantChangeSubscriber>();
        }
        else
        {
            services.AddSingleton<IGrantChangeBus, LocalGrantChangeBus>();
        }
        return builder;
    }

    /// <summary>
    /// Authentication, then tenant resolution (it reads the token's tenant claim), then authorization (grants are per
    /// tenant). Call after <c>UseRouting</c>.
    /// </summary>
    public static IApplicationBuilder UsePlatformSecurity(this IApplicationBuilder app)
    {
        app.UseAuthentication();
        app.UseTenancy();
        app.UseAuthorization();
        return app;
    }
}

/// <summary>Platform permissions plus those declared by every installed module (from the module catalog).</summary>
internal sealed class PermissionCatalog(ModuleRuntime runtime) : IPermissionCatalog
{
    public async Task<IReadOnlyList<ModulePermissionSet>> ListAsync(CancellationToken ct = default)
    {
        var modules = (await runtime.ListAsync(ct))
            .Select(s => s.Module)
            .Where(m => m.Permissions.Count > 0)
            .OrderBy(m => m.Id)
            .Select(m => new ModulePermissionSet(m.Id, m.Name, m.Permissions));
        return [new ModulePermissionSet("platform", "Platform", PlatformPermissions.All), .. modules];
    }
}
