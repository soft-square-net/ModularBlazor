using System.Text.Json.Serialization;
using Carter;
using Finbuckle.MultiTenant;
using soft.square.net.ModularBlazor.Host;
using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Infrastructure;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Security;
using NSwag;
using NSwag.Generation.Processors.Security;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

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
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
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

builder.Services.AddOpenApiDocument(settings =>
{
    settings.DocumentName = "v1";
    settings.Title = "Modular Blazor API";
    settings.Version = "v1";
    settings.Description = "Identity (users, roles, API keys), tenants and module catalog for the Modular Blazor WebAssembly client.";
    AddSecuritySchemes(settings);
    settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: false));
});

builder.Services.AddOpenApiDocument(settings =>
{
    settings.DocumentName = "elsa";
    settings.Title = "Elsa Workflows API";
    settings.Version = "v3";
    settings.Description = "The embedded Elsa workflow engine. Same JWT / API key as the main API; send X-Tenant for a tenant.";
    settings.SchemaSettings.SchemaNameGenerator = new FullNameSchemaNameGenerator();
    AddSecuritySchemes(settings);
    settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: true));
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
    // 1. The OpenAPI document, served at /openapi/v1.json (NSwag).
    app.UseOpenApi(settings => settings.Path = "/openapi/{documentName}.json");

    // 2. ReDoc at /redoc and /redoc/elsa (NSwag).
    app.UseReDoc(settings =>
    {
        settings.Path = "/redoc";
        settings.DocumentPath = "/openapi/v1.json";
    });
    app.UseReDoc(settings =>
    {
        settings.Path = "/redoc/elsa";
        settings.DocumentPath = "/openapi/elsa.json";
    });

    // 3. Scalar at /scalar, with both NSwag documents in its selector. A failure in the Elsa document cannot affect v1.
    app.MapScalarApiReference(options => options
        .WithTitle("Modular Blazor API")
        .AddDocument("v1", "Modular Blazor API", "/openapi/v1.json", isDefault: true)
        .AddDocument("elsa", "Elsa Workflows API", "/openapi/elsa.json"));

    app.MapGet("/", () => Results.Redirect("/scalar")).ExcludeFromDescription();
}

app.MapCarter();

app.Run();
