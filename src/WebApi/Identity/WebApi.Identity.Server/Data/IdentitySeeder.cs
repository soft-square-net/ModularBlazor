using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using soft.square.net.WebApi.Identity.Server.Auth;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace soft.square.net.WebApi.Identity.Server.Data;

public sealed class IdentityServerOptions
{
    /// <summary>The issuer (the service's public URL). Null: OpenIddict uses the request's base URL.</summary>
    public Uri? Issuer { get; set; }
    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(10);
    public TimeSpan RefreshTokenLifetime { get; set; } = TimeSpan.FromDays(14);
    public BlazorClientOptions BlazorClient { get; set; } = new();
    public ServiceClientOptions ElsaClient { get; set; } = new();
    public SeedOptions Seed { get; set; } = new();
}

public sealed class BlazorClientOptions
{
    public string ClientId { get; set; } = "blazor-client";
    public List<string> RedirectUris { get; set; } = [];
    public List<string> PostLogoutRedirectUris { get; set; } = [];
}

public sealed class ServiceClientOptions
{
    public string ClientId { get; set; } = "elsa-workflows";
    /// <summary>Development value in appsettings.Development.json; production from a secret store.</summary>
    public string? ClientSecret { get; set; }
}

public sealed class SeedOptions
{
    public List<TenantSeed> Tenants { get; set; } = [];
    public List<UserSeed> Users { get; set; } = [];
}

public sealed class TenantSeed
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool RequireMfa { get; set; }
}

public sealed class UserSeed
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string? DisplayName { get; set; }
    public List<string> PlatformRoles { get; set; } = [];
    public List<MembershipSeed> Memberships { get; set; } = [];
}

public sealed class MembershipSeed
{
    public string Tenant { get; set; } = "";
    public string Role { get; set; } = MembershipRoles.Member;
    public string? DisplayName { get; set; }
}

/// <summary>Migrates the database, registers the clients and scopes, and seeds the development data.</summary>
public static class IdentitySeeder
{
    public static async Task InitializeAsync(IServiceProvider root, CancellationToken ct = default)
    {
        await using var scope = root.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<IdentityServerOptions>>().Value;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(IdentitySeeder));

        // EF Core 9+ takes a database lock around migrations, so concurrent replicas are safe.
        await services.GetRequiredService<IdentityDb>().Database.MigrateAsync(ct);

        await EnsureScopesAsync(services.GetRequiredService<IOpenIddictScopeManager>(), ct);
        await EnsureClientsAsync(services.GetRequiredService<IOpenIddictApplicationManager>(), options, logger, ct);
        await SeedDataAsync(services, options.Seed, logger, ct);
    }

    private static async Task EnsureScopesAsync(IOpenIddictScopeManager scopes, CancellationToken ct)
    {
        var descriptor = new OpenIddictScopeDescriptor
        {
            Name = IdentityClaims.ApiScope,
            DisplayName = "Modular WebApi",
            Resources = { IdentityClaims.Audience },
        };
        if (await scopes.FindByNameAsync(descriptor.Name, ct) is { } existing) await scopes.UpdateAsync(existing, descriptor, ct);
        else await scopes.CreateAsync(descriptor, ct);
    }

    private static async Task EnsureClientsAsync(IOpenIddictApplicationManager applications, IdentityServerOptions options, ILogger logger, CancellationToken ct)
    {
        // Public SPA client: Authorization Code + PKCE, refresh tokens, no secret.
        var blazor = new OpenIddictApplicationDescriptor
        {
            ClientId = options.BlazorClient.ClientId,
            ClientType = ClientTypes.Public,
            ConsentType = ConsentTypes.Implicit,
            DisplayName = "Modular Blazor",
            Permissions =
            {
                Permissions.Endpoints.Authorization, Permissions.Endpoints.Token, Permissions.Endpoints.EndSession,
                Permissions.Endpoints.Revocation,
                Permissions.GrantTypes.AuthorizationCode, Permissions.GrantTypes.RefreshToken,
                Permissions.ResponseTypes.Code,
                Permissions.Scopes.Profile, Permissions.Scopes.Email, Permissions.Prefixes.Scope + IdentityClaims.ApiScope,
            },
            Requirements = { Requirements.Features.ProofKeyForCodeExchange },
        };
        foreach (var uri in options.BlazorClient.RedirectUris) blazor.RedirectUris.Add(new Uri(uri));
        foreach (var uri in options.BlazorClient.PostLogoutRedirectUris) blazor.PostLogoutRedirectUris.Add(new Uri(uri));
        await UpsertAsync(applications, blazor, ct);

        // Confidential service client: client credentials only.
        if (string.IsNullOrEmpty(options.ElsaClient.ClientSecret))
        {
            logger.LogWarning("Identity:ElsaClient:ClientSecret is not set; the {Client} client is not registered.", options.ElsaClient.ClientId);
            return;
        }
        var elsa = new OpenIddictApplicationDescriptor
        {
            ClientId = options.ElsaClient.ClientId,
            ClientSecret = options.ElsaClient.ClientSecret,
            ClientType = ClientTypes.Confidential,
            DisplayName = "Elsa Workflows",
            Permissions =
            {
                Permissions.Endpoints.Token, Permissions.GrantTypes.ClientCredentials,
                Permissions.Prefixes.Scope + IdentityClaims.ApiScope,
            },
        };
        await UpsertAsync(applications, elsa, ct);
    }

    private static async Task UpsertAsync(IOpenIddictApplicationManager applications, OpenIddictApplicationDescriptor descriptor, CancellationToken ct)
    {
        if (await applications.FindByClientIdAsync(descriptor.ClientId!, ct) is { } existing)
            await applications.UpdateAsync(existing, descriptor, ct); // re-hashes the secret from configuration
        else
            await applications.CreateAsync(descriptor, ct);
    }

    private static async Task SeedDataAsync(IServiceProvider services, SeedOptions seed, ILogger logger, CancellationToken ct)
    {
        var db = services.GetRequiredService<IdentityDb>();
        var users = services.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = services.GetRequiredService<RoleManager<IdentityRole>>();

        foreach (var role in IdentityClaims.PlatformRoles)
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));

        foreach (var tenant in seed.Tenants)
            if (!await db.Tenants.AnyAsync(t => t.TenantId == tenant.Id, ct))
                db.Tenants.Add(new TenantSettings { TenantId = tenant.Id, DisplayName = tenant.DisplayName, RequireMfa = tenant.RequireMfa });
        await db.SaveChangesAsync(ct);

        foreach (var entry in seed.Users)
        {
            var user = await users.FindByEmailAsync(entry.Email);
            if (user is null)
            {
                user = new ApplicationUser { UserName = entry.Email, Email = entry.Email, EmailConfirmed = true, DisplayName = entry.DisplayName };
                var created = await users.CreateAsync(user, entry.Password);
                if (!created.Succeeded)
                {
                    logger.LogError("Seeding {Email} failed: {Errors}", entry.Email, string.Join("; ", created.Errors.Select(e => e.Description)));
                    continue;
                }
                logger.LogInformation("Seeded account {Email}.", entry.Email);
            }

            foreach (var role in entry.PlatformRoles)
                if (!await users.IsInRoleAsync(user, role)) await users.AddToRoleAsync(user, role);

            foreach (var m in entry.Memberships)
            {
                if (await db.TenantMemberships.AnyAsync(x => x.UserId == user.Id && x.TenantId == m.Tenant, ct)) continue;
                db.TenantMemberships.Add(new TenantMembership
                {
                    UserId = user.Id, TenantId = m.Tenant, Role = m.Role, Status = MembershipStatus.Active, JoinedAt = DateTimeOffset.UtcNow,
                });
                if (m.DisplayName is not null)
                    db.TenantProfiles.Add(new TenantProfile { UserId = user.Id, TenantId = m.Tenant, DisplayName = m.DisplayName });
            }
            await db.SaveChangesAsync(ct);
        }
    }
}
