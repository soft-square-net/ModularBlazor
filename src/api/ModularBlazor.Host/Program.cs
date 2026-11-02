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
builder.Services.AddOpenApiDocument(settings =>
{
    settings.DocumentName = "v1";
    settings.Title = "Modular Blazor API";
    settings.Version = "v1";
    settings.Description = "Identity (users, roles, API keys), tenants and module catalog for the Modular Blazor WebAssembly client.";

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

// API documentation (on in Development, or anywhere with Documentation:Enabled=true).
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Documentation:Enabled"))
{
    // 1. The OpenAPI document, served at /openapi/v1.json (NSwag).
    app.UseOpenApi(settings => settings.Path = "/openapi/{documentName}.json");

    // 2. ReDoc at /redoc (NSwag).
    app.UseReDoc(settings =>
    {
        settings.Path = "/redoc";
        settings.DocumentPath = "/openapi/v1.json";
    });

    // 3. Scalar at /scalar, reading the same NSwag document.
    app.MapScalarApiReference(options => options
        .WithTitle("Modular Blazor API")
        .WithOpenApiRoutePattern("/openapi/v1.json"));

    app.MapGet("/", () => Results.Redirect("/scalar")).ExcludeFromDescription();
}

app.MapCarter();

app.Run();
