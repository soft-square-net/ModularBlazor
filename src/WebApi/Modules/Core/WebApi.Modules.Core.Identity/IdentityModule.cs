using System.Security.Claims;
using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Core.Identity;

/// <summary>
/// Core module "identity" (ships with every WebApi release). First slice: who is calling (<c>/me</c>) and a user
/// directory held in the module's settings. Persistence (a users table, migrations) comes with the modules schema.
/// </summary>
public sealed class IdentityModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("identity", "Identity", "1.0.0", "identity")
    {
        Description = "Core module: the current principal and the user directory.",
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

public sealed record CurrentPrincipal(bool IsAuthenticated, string? Name, string? AuthenticationType, IReadOnlyList<ClaimItem> Claims);

public sealed record ClaimItem(string Type, string Value);

public sealed class IdentityEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Not tenant data (yet): works with or without a tenant.
        app = app.MapGroup("").TenantOptional();

        app.MapGet("/me", (HttpContext context) =>
            {
                var user = context.User;
                return new CurrentPrincipal(
                    user.Identity?.IsAuthenticated ?? false,
                    user.Identity?.Name,
                    user.Identity?.AuthenticationType,
                    user.Claims.Select(c => new ClaimItem(c.Type, c.Value)).ToArray());
            })
            .WithSummary("The calling principal (anonymous until the gateway/host authenticates requests).");

        app.MapGet("/users", (UserDirectory users) => users.All);

        app.MapGet("/users/{userName}", (string userName, UserDirectory users) =>
            users.Find(userName) is { } user ? Results.Ok(user) : Results.NotFound());
    }
}
