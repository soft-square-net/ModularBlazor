using Carter;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using soft.square.net.WebApi.Modularity;
using soft.square.net.WebApi.OpenApi;
using soft.square.net.WebApi.Tenancy;

var builder = WebApplication.CreateBuilder(args);

// OpenAPI: /openapi/webapi.json (host endpoints) + /openapi/modules/{id}.json (one per routed module), Scalar at /scalar.
builder.Services.AddModularOpenApi();
builder.Services.AddCarter();
builder.Services.AddHealthChecks();
// Tenancy on every replica: tenant directory (TenantStore, refreshed over the broker), ITenantContext per request,
// tenant databases and per-tenant module initialization. Before the runtime modules, so tenants load first.
builder.AddPlatformTenancy("broker");
// Runtime modules: install (upload + manifest) -> activate (load + services + routes) -> deactivate / unload / uninstall.
builder.Services.AddRuntimeModules(builder.Configuration);
// Several replicas: broadcast lifecycle changes over the broker so every replica converges (needs ConnectionStrings:broker).
builder.AddRuntimeModuleBroadcast("broker");

// Telemetry to the Aspire dashboard (or any OTLP collector) when an endpoint is configured.
if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
{
    builder.Logging.AddOpenTelemetry(logging =>
    {
        logging.IncludeFormattedMessage = true;
        logging.IncludeScopes = true;
    });
    builder.Services.AddOpenTelemetry()
        .WithTracing(tracing => tracing.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation())
        .WithMetrics(metrics => metrics.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation())
        .UseOtlpExporter();
}

var app = builder.Build();

// Resolves the tenant of every request (header, host, token claim) once routing has picked the endpoint.
app.UseRouting();
app.UseTenancy();

if (ModularOpenApi.IsEnabled(app.Configuration, app.Environment))
{
    app.MapModularOpenApi();
}

app.MapHealthChecks("/health");
app.MapCarter();          // endpoints compiled into this app, including the module admin API and /api/pool
app.MapRuntimeModules();  // endpoints of modules activated at runtime

app.Run();
