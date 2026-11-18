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
    // 2.2.0: named endpoints (typed client), activate/suspend actions and subscriptions. A newer shipped version makes
    // every replica upgrade the catalog's copy on startup.
    public ModuleManifest Manifest { get; } = new("tenancy", "Tenancy", "2.2.0", "tenancy")
    {
        Description = "Core module: tenant directory admin (tenant store), subscriptions, tenant database provisioning and the current tenant.",
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

public sealed record ProvisionResult(string Tenant, string DatabaseServer, string DatabaseName, bool Created);

/// <summary>A new subscription period: from <see cref="StartsAt"/> (inclusive) to <see cref="EndsAt"/> (exclusive).</summary>
public sealed record NewSubscription(DateTimeOffset StartsAt, DateTimeOffset EndsAt, string? Plan, string? Notes);

public sealed record ExtendSubscription(DateTimeOffset EndsAt);

public sealed record CancelSubscription(string? Reason);

public sealed partial class TenancyEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Endpoint names are the OpenAPI operation ids: "Tenancy_ListTenants" becomes TenancyClient.ListTenantsAsync in
        // WebApi.Modules.Core.Tenancy.Client. Endpoints that return IResult declare their response types with Produces.
        var platform = app.MapGroup("").TenantOptional();

        platform.MapGet("/tenants", (ITenantDirectory tenants) => tenants.All.OrderBy(t => t.Id))
            .WithName("Tenancy_ListTenants")
            .WithSummary("Every tenant, as this replica's directory has it.");

        platform.MapGet("/tenants/{id}", (string id, ITenantDirectory tenants) =>
                tenants.Find(id) is { } tenant ? Results.Ok(tenant) : Results.NotFound())
            .Produces<TenantInfo>()
            .Produces(StatusCodes.Status404NotFound)
            .WithName("Tenancy_GetTenant");

        platform.MapGet("/current", (ITenantContext context) =>
                context.Tenant is { } tenant
                    ? Results.Ok(new CurrentTenant(tenant, context.ResolvedBy))
                    : Results.Problem("No tenant resolved from the X-Tenant header, the host name or the token.", statusCode: StatusCodes.Status404NotFound))
            .Produces<CurrentTenant>()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("Tenancy_GetCurrent")
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
                    : Results.Problem($"Tenant '{tenant.Id}' exists already.", statusCode: StatusCodes.Status409Conflict);
            })
            .Produces<TenantInfo>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithName("Tenancy_CreateTenant")
            .WithSummary("Creates a tenant: provisions its database, writes the tenant store, and every replica reloads; modules then migrate their schemas for it.");

        platform.MapPatch("/tenants/{id}", (string id, UpdateTenantRequest request, HttpContext http, ITenantDirectory tenants, CancellationToken ct) =>
                UpdateAsync(id, request, http, tenants, ct))
            .Produces<TenantInfo>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithName("Tenancy_UpdateTenant")
            .WithSummary("Renames a tenant, changes its host names, or suspends / re-activates it (status Active or Suspended).");

        platform.MapPost("/tenants/{id}/activate", (string id, HttpContext http, ITenantDirectory tenants, CancellationToken ct) =>
                UpdateAsync(id, new UpdateTenantRequest(null, null, TenantStatus.Active), http, tenants, ct))
            .Produces<TenantInfo>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithName("Tenancy_ActivateTenant")
            .WithSummary("Re-activates a suspended tenant: its requests are served again on every replica.");

        platform.MapPost("/tenants/{id}/suspend", (string id, HttpContext http, ITenantDirectory tenants, CancellationToken ct) =>
                UpdateAsync(id, new UpdateTenantRequest(null, null, TenantStatus.Suspended), http, tenants, ct))
            .Produces<TenantInfo>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithName("Tenancy_SuspendTenant")
            .WithSummary("Suspends a tenant: its requests are refused on every replica; its data is kept. Subscriptions never do this by themselves.");

        platform.MapPost("/tenants/{id}/provision", async (string id, ITenantDirectory tenants, TenantDatabases databases, CancellationToken ct) =>
            {
                if (tenants.Find(id) is not { } tenant) return Results.NotFound();
                var created = await databases.EnsureDatabaseAsync(tenant, ct);
                // Modules whose initialization for this tenant failed retry it on their next request.
                return Results.Ok(new ProvisionResult(tenant.Id, tenant.DatabaseServer, tenant.DatabaseName, created));
            })
            .Produces<ProvisionResult>()
            .Produces(StatusCodes.Status404NotFound)
            .RequirePermission(PlatformPermissions.TenantsManage)
            .WithName("Tenancy_ProvisionTenant")
            .WithSummary("Runs the tenant's database provisioning again (idempotent): creates what is missing and re-applies grants. A repair step.");

        MapSubscriptions(platform);
    }

    /// <summary>
    /// Subscriptions: the periods a tenant has paid for (tenant store). Informational only: when a subscription ends
    /// nothing happens by itself; the report lists the tenants an admin should look at, and the admin suspends by hand.
    /// </summary>
    private static void MapSubscriptions(RouteGroupBuilder platform)
    {
        var subscriptions = platform.MapGroup("")
            .RequirePermission(PlatformPermissions.TenantsManage)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .AddEndpointFilter(async (context, next) =>
            {
                if (context.HttpContext.RequestServices.GetService<TenantSubscriptions>() is null)
                    return Results.Problem("There is no tenant store (ConnectionStrings:TenantStore).", statusCode: StatusCodes.Status503ServiceUnavailable);
                try { return await next(context); }
                catch (TenantSubscriptionException e)
                {
                    return Results.Problem(e.Message, statusCode: e.Kind switch
                    {
                        TenantSubscriptionException.Reason.NotFound => StatusCodes.Status404NotFound,
                        TenantSubscriptionException.Reason.Invalid => StatusCodes.Status400BadRequest,
                        _ => StatusCodes.Status409Conflict
                    });
                }
            });

        subscriptions.MapGet("/subscriptions", (HttpContext http, CancellationToken ct, int endingWithinDays = 30) =>
                Store(http).ReportAsync(TimeSpan.FromDays(Math.Max(0, endingWithinDays)), ct))
            .WithName("Tenancy_SubscriptionReport")
            .WithSummary("Every tenant with its current and next subscription and when its covered time ends. NeedsAttention: " +
                         "an Active tenant with nothing covering now, or ending within endingWithinDays (default 30).");

        subscriptions.MapGet("/tenants/{id}/subscriptions", (string id, HttpContext http, CancellationToken ct) => Store(http).ListAsync(id, ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .WithName("Tenancy_ListSubscriptions")
            .WithSummary("The tenant's subscriptions, oldest first, cancelled ones included.");

        subscriptions.MapPost("/tenants/{id}/subscriptions", async (string id, NewSubscription request, HttpContext http, CancellationToken ct) =>
            {
                var subscription = await Store(http).AddAsync(id, request.StartsAt, request.EndsAt, request.Plan, request.Notes, UserOf(http), ct);
                return Results.Created($"tenants/{id}/subscriptions/{subscription.Id}", subscription);
            })
            .Produces<TenantSubscription>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("Tenancy_AddSubscription")
            .WithSummary("Adds a period [startsAt, endsAt) to the tenant. 409 when it overlaps one that is not cancelled.");

        subscriptions.MapPost("/tenants/{id}/subscriptions/{subscriptionId:guid}/extend",
                (string id, Guid subscriptionId, ExtendSubscription request, HttpContext http, CancellationToken ct) =>
                    Store(http).ExtendAsync(id, subscriptionId, request.EndsAt, ct))
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("Tenancy_ExtendSubscription")
            .WithSummary("Moves the subscription's end later (a renewal). 409 when it is cancelled or would overlap the next one.");

        subscriptions.MapPost("/tenants/{id}/subscriptions/{subscriptionId:guid}/cancel",
                (string id, Guid subscriptionId, CancelSubscription request, HttpContext http, CancellationToken ct) =>
                    Store(http).CancelAsync(id, subscriptionId, request.Reason, UserOf(http), ct))
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .WithName("Tenancy_CancelSubscription")
            .WithSummary("Cancels the subscription: it stays in the history, no longer counts, and frees its period. The tenant is not suspended.");
    }

    private static TenantSubscriptions Store(HttpContext http) => http.RequestServices.GetRequiredService<TenantSubscriptions>();

    private static string? UserOf(HttpContext http) =>
        http.User.FindFirst("sub")?.Value ?? http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? http.User.Identity?.Name;

    private static async Task<IResult> UpdateAsync(string id, UpdateTenantRequest request, HttpContext http, ITenantDirectory tenants, CancellationToken ct)
    {
        if (http.RequestServices.GetService<TenantRegistry>() is not { } registry)
            return Results.Problem("There is no tenant store (ConnectionStrings:TenantStore).", statusCode: StatusCodes.Status503ServiceUnavailable);
        var updated = await registry.UpdateAsync(id, request.Name, request.Hosts, request.Status, ct);
        if (updated is null) return Results.NotFound();
        await tenants.NotifyChangedAsync(id, ct);
        return Results.Ok(updated);
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")]
    private static partial Regex Slug();
}
