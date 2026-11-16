using Elsa.Common.Multitenancy;
using Elsa.Extensions;
using Elsa.Persistence.EFCore;
using Elsa.Persistence.EFCore.Extensions;
using Elsa.Persistence.EFCore.Modules.Management;
using Elsa.Persistence.EFCore.Modules.Runtime;
using Elsa.Tenants.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Elsa.Infrastructure;

/// <summary>Optional Elsa runtime module; install only in a dedicated workflow pool or enable in an all-in-one host.</summary>
public sealed class ElsaModule : IRuntimeModule, IModulePipeline
{
    public ModuleManifest Manifest { get; } = new("elsa", "Elsa Workflows", "0.1.0", "elsa")
    {
        Description = "Optional Elsa workflow engine for newsroom automation.",
        HotUnload = false,
        DefaultSettings = new Dictionary<string, string?>
        {
            ["Elsa:Schema"] = "elsa",
            ["Elsa:RunMigrations"] = "true",
            ["Elsa:PollInterval"] = "00:00:15"
        },
        Permissions =
        [
            new("workflow.view", "View tenant workflows and executions."),
            new("workflow.design", "Design and publish tenant workflows."),
            new("workflow.run", "Start and manage tenant workflows.")
        ]
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.AddSingleton(settings); // allowlisted module configuration only; never the host configuration root
        var connection = settings.GetConnectionString("elsa")
            ?? throw new InvalidOperationException("The host must provide ConnectionStrings:elsa from a secret provider.");
        var schema = settings["Elsa:Schema"] ?? "elsa";
        var runMigrations = settings.GetValue("Elsa:RunMigrations", true);
        var databaseOptions = new ElsaDbContextOptions { SchemaName = schema };

        services.AddScoped<ElsaPlatformTenantResolver>();
        services.AddSingleton<ITenantsProvider, ElsaPlatformTenantsProvider>();
        services.AddHttpClient<NewsroomAutomationClient>();
        services.AddHostedService<NewsroomAutomationService>();

        services.AddElsa(elsa =>
        {
            elsa.UseWorkflowManagement(management => management.UseEntityFrameworkCore(ef =>
            {
                ef.RunMigrations = runMigrations;
                ef.UsePostgreSql(connection, databaseOptions);
            }));
            elsa.UseWorkflowRuntime(runtime => runtime.UseEntityFrameworkCore(ef =>
            {
                ef.RunMigrations = runMigrations;
                ef.UsePostgreSql(connection, databaseOptions);
            }));
            elsa.UseTenants(tenants =>
                tenants.ConfigureMultitenancy(o => o.TenantResolverPipelineBuilder.Append<ElsaPlatformTenantResolver>()));
            elsa.Services.AddSingleton<ITenantsProvider, ElsaPlatformTenantsProvider>();
            elsa.UseWorkflowsApi();
            elsa.UseHttp();
        });
    }

    public void ConfigurePipeline(IApplicationBuilder app)
    {
        app.UseMiddleware<ElsaWorkflowPermissionMiddleware>();
        app.UseRouting();
        app.UseWorkflowsApi();
        app.UseWorkflows();
    }

    public void ConfigureEndpoint(IEndpointConventionBuilder endpoint) => endpoint.RequireAuthorization();
}

/// <summary>Elsa receives only the tenant already resolved and validated by the WebApi host.</summary>
internal sealed class ElsaPlatformTenantResolver(ITenantContext tenant) : ITenantResolver
{
    public Task<TenantResolverResult> ResolveAsync(TenantResolverContext context) =>
        Task.FromResult(tenant.TenantId is { } id
            ? TenantResolverResult.Resolved(id)
            : TenantResolverResult.Unresolved());
}

/// <summary>Elsa's background services enumerate active tenants from the platform's single tenant directory.</summary>
internal sealed class ElsaPlatformTenantsProvider(ITenantDirectory directory) : ITenantsProvider
{
    public Task<IEnumerable<Tenant>> ListAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IEnumerable<Tenant>>(directory.All.Where(t => t.IsActive)
            .Select(t => new Tenant { Id = t.Id, Name = t.Name }).ToArray());

    public Task<Tenant?> FindAsync(TenantFilter filter, CancellationToken cancellationToken = default) =>
        Task.FromResult(directory.Find(filter.Id ?? string.Empty) is { IsActive: true } tenant
            ? new Tenant { Id = tenant.Id, Name = tenant.Name }
            : null);
}

/// <summary>Checks Elsa API operations against host-owned tenant grants, independent of Elsa's built-in user store.</summary>
internal sealed class ElsaWorkflowPermissionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IAccessScopes access)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        var permission = path.Contains("workflow-instances", StringComparison.OrdinalIgnoreCase)
            ? "workflow.run"
            : HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method)
                ? "workflow.view"
                : "workflow.design";

        if (!await access.HasPermissionAsync(permission, context.RequestAborted))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }
}
