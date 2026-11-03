using Carter;
using FastEndpoints.Swagger;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.AspNetCore.Extensions;
using Microsoft.EntityFrameworkCore;
using NJsonSchema.Generation;
using NSwag;
using NSwag.Generation.AspNetCore;
using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;
using NSwag.Generation.Processors.Security;
using Scalar.AspNetCore;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host;
using soft.square.net.ModularBlazor.Infrastructure;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using soft.square.net.ModularBlazor.Infrastructure.Security;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Module store: the enabled host modules' configuration (Modules:<Name>) is injected here, and the modules
// themselves are found by HostModules.All (they are referenced by the build through host-modules.props).
HostModules.StorePath = builder.Configuration["ModuleStore:Path"] ?? "modules-store";
builder.Configuration.AddJsonFile(Path.Combine(Path.GetFullPath(HostModules.StorePath), "host-modules.config.json"),
    optional: true, reloadOnChange: false);

// ModuleKind travels as "dll" / "nupkg", exactly what the Blazor client expects.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddInfrastructure(builder.Configuration);

// JWT bearer + API key authentication and permission-based authorization.
builder.Services.AddSecurity(builder.Configuration);

// Host modules (modules/host/*): each one's DbContext, repositories and initializer, plus MediatR handlers and
// FluentValidation validators from its Application project.
builder.Services.AddHostModules(builder.Configuration, HostModules.All);

// Every ICarterModule found in the modules' Infrastructure assemblies becomes endpoints.
builder.Services.AddCarter(configurator: c => c.WithModules(HostModules.CarterModuleTypes()));

builder.Services.AddCors(options => options.AddPolicy("client", policy =>
{
  //var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
  //policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("x-elsa-workflow-instance-id");

  // var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
  policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("x-elsa-workflow-instance-id");
}));


// NSwag builds the OpenAPI document from the minimal API endpoints.
builder.Services.AddEndpointsApiExplorer();
// Elsa's endpoints live in their own document ("elsa"); see OpenApiDocuments.cs.
var elsaBasePath = builder.Configuration["ElsaHost:ApiBasePath"] ?? "/elsa/api";

void AddSecuritySchemes(NSwag.Generation.AspNetCore.AspNetCoreOpenApiDocumentGeneratorSettings settings)
{
  settings.AddSecurity("JWT", new OpenApiSecurityScheme
  {
    Type = OpenApiSecuritySchemeType.Http,
    Scheme = "bearer",
    BearerFormat = "JWT",
    Description = "Token from POST /api/v1/identity/tokens."
  });
  settings.AddSecurity("ApiKey", new OpenApiSecurityScheme
  {
    Type = OpenApiSecuritySchemeType.ApiKey,
    In = OpenApiSecurityApiKeyLocation.Header,
    Name = "X-API-Key",
    Description = "Key from POST /api/v1/identity/api-keys."
  });
  settings.OperationProcessors.Add(new AspNetCoreOperationSecurityScopeProcessor("JWT"));
  settings.OperationProcessors.Add(new AspNetCoreOperationSecurityScopeProcessor("ApiKey"));
}

//// 1. Register the filtered document in Program.cs
builder.Services.AddOpenApiDocument(settings =>
{
  settings.DocumentName = "elsa";
  settings.Title = "Elsa V3 Workflows API";
  settings.Version = "v3";
  settings.Description = "The embedded Elsa workflow engine API.";

  AddSecuritySchemes(settings);

  // This extension tells NSwag to include FastEndpoints routes
  // settings.EnableFastEndpoints(options => { }, builder.Services.BuildServiceProvider());
  // Skip heavy activity model reflection

  // settings.SchemaSettings.SchemaProcessors.Add(new SafeElsaSchemaProcessor());

  // Elsa registers FastEndpoints rather than MVC controllers, so filter by the
  // mounted API route instead of ControllerType.Namespace.
  settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: true));

});
builder.Services.AddOpenApiDocument(settings =>
{
  settings.DocumentName = "v1";
  settings.Title = "Modular Blazor API";
  settings.Version = "v1";
  settings.Description = "Identity (users, roles, API keys), tenants and module catalog for the Modular Blazor WebAssembly client.";
  AddSecuritySchemes(settings);
  settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: false));
});



var app = builder.Build();

// Creates/updates the databases and seeds them (used by the Aspire containers): the tenant store (with the
// root tenant), the platform data, and every tenant's business data. Needs the migrations to have been
// generated first: scripts/add-migration.*
if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
  using var scope = app.Services.CreateScope();
  await scope.ServiceProvider.GetRequiredService<ITenantDatabaseInitializer>().InitializeAsync();
}

// Validation failures from the CQRS pipeline become 400 problem responses.
app.UseExceptionHandler();

app.UseCors("client");

// Resolves the tenant from the X-Tenant header (Finbuckle). Requests without one simply have no tenant.
app.UseMultiTenant();

// Refuses tenants that are deactivated or whose subscription ended.
app.UseTenantStatus();

// Authentication (JWT / API key) and authorization.
app.UseSecurity();

// Module middleware (ElsaHost mounts the Elsa workflows API here).
app.UseHostModules(HostModules.All);

// API documentation (on in Development, or anywhere with Documentation:Enabled=true).
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Documentation:Enabled"))
{
  // 1. Serve only the NSwag v1 document here. The Elsa document is generated
  // by the custom endpoint below and must not be intercepted by NSwag.
  app.UseOpenApi(settings => settings.Path = "/openapi/v1.json");
  app.UseOpenApi(settings => settings.Path = "/swagger/v3/swagger.json");


  ////// 2. ReDoc at /redoc and /redoc/elsa (NSwag).
  //app.UseReDoc(settings =>
  //{
  //  settings.Path = "/redoc";
  //  settings.DocumentPath = "/openapi/v1.json";
  //  settings.UseModuleTypeForCustomJavaScript = true;
  //});
  //app.UseReDoc(settings =>
  //{
  //  settings.Path = "/redoc/elsa";
  //  settings.DocumentPath = "/openapi/elsa.json";
  //  settings.UseModuleTypeForCustomJavaScript = true;
  //});

  // Elsa FastEndpoints are mounted by Elsa middleware and their route
  // normalization can make NSwag fail. Generate this document from the
  // registered ASP.NET Core endpoint metadata instead.
  app.MapGet("/openapi/elsa.json", (IEnumerable<EndpointDataSource> endpointSources) =>
      Results.Json(ElsaOpenApiDocumentGenerator.Generate(elsaBasePath, endpointSources)))
      .ExcludeFromDescription();

  /*
    The previous hand-maintained fallback is intentionally removed. The
    custom generator above derives its paths from registered endpoint metadata.
    {
      // Workflow Definitions
      ["/elsa/api/workflow-definitions"] = new
      {
        get = new { tags = new[] { "WorkflowDefinitions" }, summary = "List workflow definitions" },
        post = new { tags = new[] { "WorkflowDefinitions" }, summary = "Save a workflow definition" }
      },
      ["/elsa/api/workflow-definitions/by-definition-id/{definitionId}"] = new
      {
        get = new { tags = new[] { "WorkflowDefinitions" }, summary = "Get a definition by stable ID" }
      },
      ["/elsa/api/workflow-definitions/{definitionId}/publish"] = new
      {
        post = new { tags = new[] { "WorkflowDefinitions" }, summary = "Publish a definition" }
      },
      ["/elsa/api/workflow-definitions/{definitionId}/execute"] = new
      {
        post = new { tags = new[] { "WorkflowDefinitions" }, summary = "Run / execute a definition immediately" }
      },
      ["/elsa/api/workflow-definitions/{definitionId}/dispatch"] = new
      {
        post = new { tags = new[] { "WorkflowDefinitions" }, summary = "Queue / dispatch a definition to run" }
      },

      // Workflow Instances
      ["/elsa/api/workflow-instances"] = new
      {
        get = new { tags = new[] { "WorkflowInstances" }, summary = "List workflow instances" },
        post = new { tags = new[] { "WorkflowInstances" }, summary = "Query workflow instances" }
      },
      ["/elsa/api/workflow-instances/{id}"] = new
      {
        get = new { tags = new[] { "WorkflowInstances" }, summary = "Get a workflow instance by ID" },
        delete = new { tags = new[] { "WorkflowInstances" }, summary = "Delete a workflow instance" }
      },
      ["/elsa/api/workflow-instances/{id}/journal"] = new
      {
        get = new { tags = new[] { "WorkflowInstances" }, summary = "Read an instance journal" },
        post = new { tags = new[] { "WorkflowInstances" }, summary = "Read filtered journal records" }
      },
      ["/elsa/api/workflow-instances/{id}/execution-state"] = new
      {
        get = new { tags = new[] { "WorkflowInstances" }, summary = "Read execution state" }
      },

      // Bookmarks & Activity Descriptors
      ["/elsa/api/bookmarks/resume"] = new
      {
        get = new { tags = new[] { "Bookmarks" }, summary = "Resume a bookmark callback (GET)" },
        post = new { tags = new[] { "Bookmarks" }, summary = "Resume a bookmark callback (POST)" }
      },
      ["/elsa/api/descriptors/activities"] = new
      {
        get = new { tags = new[] { "ActivityDescriptors" }, summary = "List activity descriptors and catalogue" }
      },

      // Workflow Alterations
      ["/elsa/api/alterations/run"] = new
      {
        post = new { tags = new[] { "Alterations" }, summary = "Run immediate alterations against workflow instances" }
      }
    }
    }
  */

  // 3. Scalar at /scalar, with both NSwag documents in its selector. A failure in the Elsa document cannot affect v1.
  app.MapScalarApiReference(options => options
      .WithTitle("Modular Blazor API")
      .AddDocument("v1", "Modular V1 Blazor API", "/openapi/v1.json", isDefault: true)
      .AddDocument("elsa", "Elsa V3 Workflows API", "/openapi/elsa.json")
      // Both documents declare the JWT (Bearer) and ApiKey (X-API-Key) schemes; Scalar's Authentication panel
      // offers both, and keeps what you entered across reloads and when switching documents.
      .AddPreferredSecuritySchemes("JWT", "ApiKey")
      .WithPersistentAuthentication());


  app.MapGet("/", () => Results.Redirect("/scalar")).ExcludeFromDescription();
}

app.MapCarter();

app.Run();



///// <summary>Elsa publishes its own API and contains route descriptions that collide in NSwag's document.</summary>
//internal sealed class ExcludeElsaApiFromOpenApiProcessor : IOperationProcessor
//{
//    public bool Process(OperationProcessorContext context)
//    {
//        if (context is not AspNetCoreOperationProcessorContext aspNetCoreContext)
//            return true;

//        var route = aspNetCoreContext.ApiDescription.RelativePath?.TrimStart('/');
//        return route is null || !route.StartsWith("elsa/api/", StringComparison.OrdinalIgnoreCase);
//    }
//}
