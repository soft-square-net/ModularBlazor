using System.Security.Claims;
using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Core.Identity;

/// <summary>
/// Core module "identity" (ships with every WebApi release). First slice: who is calling (<c>/me</c>) and a user
/// directory held in the module's settings. Persistence (a users table, migrations) comes with the modules schema.
/// </summary>
public sealed class IdentityModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("identity", "Identity", "1.1.0", "identity")
    {
        Description = "Core module: the current principal with its permissions, the permission catalog and grant admin.",
        DefaultSettings = new Dictionary<string, string?>
        {
            ["Identity:Users:0:UserName"] = "admin",
            ["Identity:Users:0:DisplayName"] = "Administrator",
            ["Identity:Users:0:Email"] = "admin@example.test",
            ["Identity:Users:0:Roles:0"] = "admin",
            ["Identity:Users:1:UserName"] = "editor",
            ["Identity:Users:1:DisplayName"] = "Editor",
            ["Identity:Users:1:Email"] = "editor@example.test",
            ["Identity:Users:1:Roles:0"] = "editor"
        }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<IdentityModuleOptions>(settings.GetSection("Identity"));
        services.AddSingleton<UserDirectory>();
    }
}

public sealed class IdentityModuleOptions
{
    public List<UserAccount> Users { get; set; } = [];
}

public sealed class UserAccount
{
    public string UserName { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public List<string> Roles { get; set; } = [];
}

/// <summary>Module singleton over the configured users; a settings change reloads the module with the new list.</summary>
public sealed class UserDirectory(IOptions<IdentityModuleOptions> options)
{
    private readonly Dictionary<string, UserAccount> _users = options.Value.Users
        .Where(u => !string.IsNullOrWhiteSpace(u.UserName))
        .GroupBy(u => u.UserName, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

    public IReadOnlyCollection<UserAccount> All => _users.Values;

    public UserAccount? Find(string userName) => _users.GetValueOrDefault(userName);
}

public sealed record CurrentPrincipal(bool IsAuthenticated, string? UserId, string? Name, string? Tenant, string? AuthenticationType,
    IReadOnlyCollection<string> Permissions, IReadOnlyList<ClaimItem> Claims);

public sealed record ClaimItem(string Type, string Value);

public sealed class IdentityEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Platform-level endpoints: they work with or without a tenant.
        var platform = app.MapGroup("").TenantOptional();

        platform.MapGet("/me", async (HttpContext context, IAccessScopes access, ITenantContext tenant, CancellationToken ct) =>
            {
                var user = context.User;
                return new CurrentPrincipal(
                    user.Identity?.IsAuthenticated ?? false,
                    access.UserId,
                    user.Identity?.Name,
                    tenant.TenantId,
                    user.Identity?.AuthenticationType,
                    await access.PermissionsAsync(ct),
                    user.Claims.Select(c => new ClaimItem(c.Type, c.Value)).ToArray());
            })
            .AllowAnonymous()
            .WithSummary("The caller: token claims, the request's tenant and the permissions held there right now (grants and platform roles).");

        platform.MapGet("/permissions", (IPermissionCatalog catalog, CancellationToken ct) => catalog.ListAsync(ct))
            .RequirePermission(PlatformPermissions.GrantsManage)
            .WithSummary("The permission catalog: the platform's permissions and those declared by every installed module.");

        // Legacy directory from the module's settings; accounts move to the identity service (see the auth design).
        platform.MapGet("/users", (UserDirectory users) => users.All);

        platform.MapGet("/users/{userName}", (string userName, UserDirectory users) =>
            users.Find(userName) is { } user ? Results.Ok(user) : Results.NotFound());

        // Grants of the request's tenant (tenant required). Shift grants are written by the shifts module, not here.
        var grants = app.MapGroup("/grants").RequirePermission(PlatformPermissions.GrantsManage);

        grants.MapGet("/", (string? userId, string? source, IGrantStore store, CancellationToken ct) => store.ListAsync(userId, source, ct))
            .WithSummary("Grants in this tenant, optionally of one user (?userId=) or one source (?source=standing, shift:...).");

        grants.MapPost("/", async (NewGrant grant, IGrantStore store, CancellationToken ct) =>
            {
                try
                {
                    var created = await store.AddAsync(grant, GrantSources.Standing, ct);
                    return Results.Created($"grants/{created.Id}", created);
                }
                catch (ArgumentException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status400BadRequest); }
            })
            .WithSummary("Grants a permission in a scope (\"tenant\", \"press:{id}\", \"category:{id}\"), optionally between validFrom and validTo.");

        grants.MapDelete("/{id:guid}", async (Guid id, IGrantStore store, CancellationToken ct) =>
                await store.RevokeAsync(id, ct) ? Results.NoContent() : Results.NotFound())
            .WithSummary("Revokes a grant; the user's rights change on every replica at once.");
    }
}
