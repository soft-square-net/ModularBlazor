using System.Reflection;
using Elsa.Common.Multitenancy;
using Elsa.Extensions;
using Elsa.Tenants.Extensions;
using Elsa.EntityFrameworkCore;
using Elsa.EntityFrameworkCore.Extensions;
using Elsa.EntityFrameworkCore.Modules.Management;
using Elsa.EntityFrameworkCore.Modules.Runtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Application.Queries;
using soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure.Tenancy;
using soft.square.net.ModularBlazor.Infrastructure.Modules;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure;

/// <summary>
/// Hosts the Elsa 3 workflow engine inside this API (modelled on Elsa's "Hosting Elsa in an existing app" guide):
/// workflow management + runtime persisted with EF Core, the workflows REST API, HTTP activities, and
/// multi-tenancy driven by Finbuckle (see Tenancy/FinbuckleTenancy.cs).
///
/// Database: Elsa's tables live in the default database (ConnectionStrings:ElsaDatabase, else ConnectionStrings:TenantStore)
/// in their own schema; tenants are separated by Elsa's TenantId column. Elsa owns its migrations.
/// </summary>
public sealed class ElsaHostModule : IHostModule
{
    public string Name => "ElsaHost";

    public Assembly ApplicationAssembly => typeof(GetElsaInfoQuery).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(ElsaHostOptions.SectionName).Get<ElsaHostOptions>() ?? new ElsaHostOptions();
        services.AddSingleton(options);
        services.AddSingleton(new ElsaHostSettings(options.ApiBasePath, options.Schema));

        var connection = configuration.GetConnectionString("ElsaDatabase")
            ?? configuration.GetConnectionString("TenantStore")
            ?? throw new InvalidOperationException("ConnectionStrings:ElsaDatabase (or TenantStore) is not configured.");
        var provider = configuration.GetValue("TenantStore:Provider", DatabaseProvider.SqlServer);
        var dbOptions = new ElsaDbContextOptions { SchemaName = options.Schema };

        services.AddScoped<FinbuckleTenantResolver>();

        services.AddElsa(elsa =>
        {
            elsa.UseWorkflowManagement(management => management.UseEntityFrameworkCore(ef =>
            {
                ef.RunMigrations = options.RunMigrations;
                switch (provider)
                {
                    case DatabaseProvider.PostgreSql: ef.UsePostgreSql(connection, dbOptions); break;
                    case DatabaseProvider.SqlServer: ef.UseSqlServer(connection, dbOptions); break;
                    default: throw new NotSupportedException($"ElsaHost does not support the {provider} provider (SqlServer and PostgreSql only).");
                }
            }));

            elsa.UseWorkflowRuntime(runtime => runtime.UseEntityFrameworkCore(ef =>
            {
                ef.RunMigrations = options.RunMigrations;
                switch (provider)
                {
                    case DatabaseProvider.PostgreSql: ef.UsePostgreSql(connection, dbOptions); break;
                    case DatabaseProvider.SqlServer: ef.UseSqlServer(connection, dbOptions); break;
                    default: throw new NotSupportedException($"ElsaHost does not support the {provider} provider (SqlServer and PostgreSql only).");
                }
            }));

            // One tenant model: Finbuckle decides who the tenant is (resolver in the pipeline) ...
            elsa.UseTenants(tenants =>
                tenants.ConfigureMultitenancy(o => o.TenantResolverPipelineBuilder.Append<FinbuckleTenantResolver>()));

            elsa.UseWorkflowsApi();
            elsa.UseHttp();   // HTTP-triggered workflows
        });

        // ... and which tenants exist (provider). Registered after AddElsa so it replaces the default provider.
        services.AddSingleton<ITenantsProvider, FinbuckleTenantsProvider>();

        // Elsa's endpoints are FastEndpoints; their authorization runs on this host's schemes (JWT / API key).
    }

    public void Configure(WebApplication app)
    {
        var options = app.Services.GetRequiredService<ElsaHostOptions>();

        if (options.RequirePermissions)
            app.UseMiddleware<ElsaApiPermissionMiddleware>(options.ApiBasePath);

        app.UseWorkflowsApi(options.ApiBasePath.Trim('/'));
        app.UseWorkflows();   // HTTP workflow triggers
    }
}
