using System.Text.RegularExpressions;
using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;

namespace soft.square.net.WebApi.Modules.Core.Tenancy;

/// <summary>
/// Core module "tenancy" (ships with every WebApi release): the admin side of the tenant directory.
/// <list type="bullet">
/// <item>The host resolves the tenant of every request and keeps the directory (tenant store, cached on every replica);
/// this module writes the tenant store and tells every replica to reload ("tenants.changed").</item>
/// <item>Creating a tenant provisions its database; modules then migrate their schema in it (ITenantInitializer).</item>
/// <item>On activation it seeds the tenants listed in its settings (the lab's acme and globex) when they are missing.</item>
/// </list>
/// Platform-level endpoints: they work without a tenant. Reading needs a signed-in caller; writing needs
/// <see cref="PlatformPermissions.TenantsManage"/>.
/// </summary>
public sealed class TenancyModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("tenancy", "Tenancy", "2.1.0", "tenancy")
    {
        Description = "Core module: tenant directory admin (tenant store), tenant database provisioning and the current tenant.",
        DefaultSettings = new Dictionary<string, string?>
        {
            ["Tenancy:DefaultDatabaseServer"] = "tenant-data",
            ["Tenancy:Seed:0:Id"] = "acme",
            ["Tenancy:Seed:0:Name"] = "Acme Corporation",
            ["Tenancy:Seed:0:DatabaseName"] = "tenant-acme",
            ["Tenancy:Seed:0:Hosts:0"] = "acme.localhost",
            ["Tenancy:Seed:1:Id"] = "globex",
            ["Tenancy:Seed:1:Name"] = "Globex",
            ["Tenancy:Seed:1:DatabaseName"] = "tenant-globex",
            ["Tenancy:Seed:1:Hosts:0"] = "globex.localhost"
        }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<TenancyOptions>(settings.GetSection("Tenancy"));
        services.AddSingleton<IModuleActivation, TenantSeeder>();
    }
}

public sealed class TenancyOptions
{
    /// <summary>Server (connection string name) for databases of new tenants that do not name one.</summary>
    public string DefaultDatabaseServer { get; set; } = "tenant-data";

    /// <summary>Tenants created on activation when the tenant store does not have them.</summary>
    public List<SeedTenant> Seed { get; set; } = [];
}

public sealed class SeedTenant
{
    public string Id { get; set; } = "";
    public string? Name { get; set; }
    public string? DatabaseServer { get; set; }
    public string? DatabaseName { get; set; }
    public List<string> Hosts { get; set; } = [];
}

/// <summary>Seeds the configured tenants into the tenant store; runs on every replica that loads the module, idempotent.</summary>
internal sealed class TenantSeeder(IServiceProvider services, IOptions<TenancyOptions> options, ILogger<TenantSeeder> log) : IModuleActivation
{
    public async Task ActivatedAsync(CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var registry = scope.ServiceProvider.GetService<TenantRegistry>();
        if (registry is null) return; // no tenant store: the host reads tenants from its configuration

        var directory = scope.ServiceProvider.GetRequiredService<ITenantDirectory>();
        var provisioning = new TenantProvisioning(scope.ServiceProvider.GetRequiredService<TenantDatabases>(), registry, directory, log);
        foreach (var seed in options.Value.Seed.Where(s => !string.IsNullOrWhiteSpace(s.Id)))
        {
            var tenant = new TenantInfo(seed.Id, seed.Name ?? seed.Id, TenantStatus.Active, seed.Hosts,
                seed.DatabaseServer ?? options.Value.DefaultDatabaseServer, seed.DatabaseName ?? $"tenant-{seed.Id}");
            if (await provisioning.CreateAsync(tenant, ct) is TenantProvisioning.Outcome.Created)
                log.LogInformation("Seeded tenant {Tenant}", tenant.Id);
        }
    }
}

/// <summary>Creates a tenant: its database first, then the tenant store row, then every replica is told.</summary>
internal sealed class TenantProvisioning(TenantDatabases databases, TenantRegistry registry, ITenantDirectory directory, ILogger log)
{
    public enum Outcome { Created, Exists }

    public async Task<Outcome> CreateAsync(TenantInfo tenant, CancellationToken ct)
    {
        if (directory.Find(tenant.Id) is not null) return Outcome.Exists;
        if (await databases.EnsureDatabaseAsync(tenant, ct))
            log.LogInformation("Created database {Database} for tenant {Tenant}", tenant.DatabaseName, tenant.Id);
        if (!await registry.AddAsync(tenant, ct)) return Outcome.Exists;
        await directory.NotifyChangedAsync(tenant.Id, ct); // modules migrate their schemas for it (ITenantInitializer)
        return Outcome.Created;
    }
}

public sealed record CreateTenantRequest(string Id, string? Name, List<string>? Hosts, string? DatabaseServer, string? DatabaseName);

public sealed record UpdateTenantRequest(string? Name, List<string>? Hosts, TenantStatus? Status);

public sealed record CurrentTenant(TenantInfo Tenant, string? ResolvedBy);

public sealed partial class TenancyEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var platform = app.MapGroup("").TenantOptional();

        platform.MapGet("/tenants", (ITenantDirectory tenants) => tenants.All.OrderBy(t => t.Id))
            .WithSummary("Every tenant, as this replica's directory has it.");

        platform.MapGet("/tenants/{id}", (string id, ITenantDirectory tenants) =>
            tenants.Find(id) is { } tenant ? Results.Ok(tenant) : Results.NotFound());

        platform.MapGet("/current", (ITenantContext context) =>
                context.Tenant is { } tenant
                    ? Results.Ok(new CurrentTenant(tenant, context.ResolvedBy))
                    : Results.Problem("No tenant resolved from the X-Tenant header, the host name or the token.", statusCode: StatusCodes.Status404NotFound))
            .WithSummary("The tenant of this request, as the host resolved it (header, host name, then token claim).");

        platform.MapPost("/tenants", async (CreateTenantRequest request, HttpContext http, ITenantDirectory tenants,
                TenantDatabases databases, IOptions<TenancyOptions> options, ILogger<TenancyEndpoints> log, CancellationToken ct) =>
            {
                if (http.RequestServices.GetService<TenantRegistry>() is not { } registry)
                    return Results.Problem("There is no tenant store (ConnectionStrings:TenantStore).", statusCode: StatusCodes.Status503ServiceUnavailable);
                if (!Slug().IsMatch(request.Id))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["id"] = ["Lowercase letters, digits and '-', at most 40 characters."] });

                var tenant = new TenantInfo(request.Id, request.Name ?? request.Id, TenantStatus.Active, request.Hosts ?? [],
                    request.DatabaseServer ?? options.Value.DefaultDatabaseServer, request.DatabaseName ?? $"tenant-{request.Id}");
                if (!databases.IsConfigured(tenant.DatabaseServer))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["databaseServer"] = [$"Unknown database server '{tenant.DatabaseServer}' (no ConnectionStrings:{tenant.DatabaseServer} on this replica)."] });
                var outcome = await new TenantProvisioning(databases, registry, tenants, log).CreateAsync(tenant, ct);
                return outcome == TenantProvisioning.Outcome.Created
                    ? Results.Created($"tenants/{tenant.Id}", tenant)
                    : Results.Conflict(new { error = $"Tenant '{tenant.Id}' exists already." });
            })
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithSummary("Creates a tenant: provisions its database, writes the tenant store, and every replica reloads; modules then migrate their schemas for it.");

        platform.MapPatch("/tenants/{id}", async (string id, UpdateTenantRequest request, HttpContext http, ITenantDirectory tenants, CancellationToken ct) =>
            {
                if (http.RequestServices.GetService<TenantRegistry>() is not { } registry)
                    return Results.Problem("There is no tenant store (ConnectionStrings:TenantStore).", statusCode: StatusCodes.Status503ServiceUnavailable);
                var updated = await registry.UpdateAsync(id, request.Name, request.Hosts, request.Status, ct);
                if (updated is null) return Results.NotFound();
                await tenants.NotifyChangedAsync(id, ct);
                return Results.Ok(updated);
            })
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithSummary("Renames a tenant, changes its host names, or suspends / re-activates it (status Active or Suspended).");

        platform.MapPost("/tenants/{id}/provision", async (string id, ITenantDirectory tenants, TenantDatabases databases, CancellationToken ct) =>
            {
                if (tenants.Find(id) is not { } tenant) return Results.NotFound();
                var created = await databases.EnsureDatabaseAsync(tenant, ct);
                // Modules whose initialization for this tenant failed retry it on their next request.
                return Results.Ok(new { tenant = tenant.Id, tenant.DatabaseServer, tenant.DatabaseName, created });
            })
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithSummary("Runs the tenant's database provisioning again (idempotent): creates what is missing and re-applies grants. A repair step.");
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")]
    private static partial Regex Slug();
}
