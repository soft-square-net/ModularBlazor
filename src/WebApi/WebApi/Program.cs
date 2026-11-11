using Carter;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using soft.square.net.WebApi.Modularity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCarter();
builder.Services.AddHealthChecks();
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

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapHealthChecks("/health");
app.MapCarter();          // endpoints compiled into this app, including the module admin API and /api/pool
app.MapRuntimeModules();  // endpoints of modules activated at runtime

app.Run();
