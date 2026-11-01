using System.Text.Json.Serialization;
using Carter;
using Finbuckle.MultiTenant;
using soft.square.net.ModularBlazor.Host;
using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Infrastructure;
using soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ModuleKind travels as "dll" / "nupkg", exactly what the Blazor client expects.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddInfrastructure(builder.Configuration);

// Vertical slices: every ICarterModule found in the host modules (modules/host/*) becomes endpoints.
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
    settings.Description = "Authentication and module catalog for the Modular Blazor WebAssembly client.";
});

var app = builder.Build();

// Creates/updates the tenant store schema (used by the Aspire containers). Needs the TenantStore
// migrations to have been generated first: scripts/add-migration.*
if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<TenantStoreDbContext>().Database.MigrateAsync();
}

app.UseCors("client");

// Resolves the tenant from the X-Tenant header (Finbuckle). Requests without one simply have no tenant.
app.UseMultiTenant();

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
