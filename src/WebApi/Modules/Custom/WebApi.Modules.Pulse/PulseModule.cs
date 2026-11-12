using System.Reflection;
using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Modules.Pulse;

/// <summary>
/// Sample for the runtime's module hosted services and module pipelines:
/// <list type="bullet">
/// <item><see cref="PulseWorker"/>, a BackgroundService registered with AddHostedService, beats once a second while the
/// module is loaded (Api and Worker pools).</item>
/// <item><see cref="ConfigurePipeline"/> builds a private pipeline the way a third-party library would
/// (<see cref="PulseLibrary.UsePulseLibrary"/>: middleware, UseRouting, UseEndpoints) behind /api/pulse/{**path}.</item>
/// <item>A Carter route (/api/pulse/status) next to the pipeline: more specific, so it wins over the catch-all.</item>
/// </list>
/// </summary>
public sealed class PulseModule : IRuntimeModule, IModulePipeline
{
    private static readonly Version AssemblyVersion = typeof(PulseModule).Assembly.GetName().Version ?? new Version(1, 0, 0);

    public ModuleManifest Manifest { get; } = new("pulse", "Pulse", $"{AssemblyVersion.Major}.{AssemblyVersion.Minor}.{AssemblyVersion.Build}", "pulse")
    {
        Description = "Sample: a BackgroundService and a private ASP.NET Core pipeline.",
        DefaultSettings = new Dictionary<string, string?> { ["Pulse:IntervalMs"] = "1000", ["Pulse:FailOnStart"] = "false" },
#if NO_HOT_UNLOAD
        HotUnload = false
#endif
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<PulseOptions>(settings.GetSection("Pulse"));
        services.AddSingleton<PulseState>();
        services.AddHostedService<PulseWorker>();
        services.AddHostedService<StartupProbe>(); // fails on purpose with Pulse:FailOnStart=true
    }

    public void ConfigurePipeline(IApplicationBuilder app) => app.UsePulseLibrary();

    // The host authorizes the catch-all before the pipeline runs: here, its fallback policy (a signed-in caller).
    public void ConfigureEndpoint(IEndpointConventionBuilder endpoint) => endpoint.TenantOptional();
}

public sealed class PulseOptions
{
    public int IntervalMs { get; set; } = 1000;
    public bool FailOnStart { get; set; }
}

public sealed class PulseState
{
    private long _beats;
    public long Beats => Interlocked.Read(ref _beats);
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public void Beat() => Interlocked.Increment(ref _beats);
}

/// <summary>An ordinary BackgroundService: it knows nothing about the runtime.</summary>
public sealed class PulseWorker(PulseState state, IOptions<PulseOptions> options, ILogger<PulseWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Pulse worker started");
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(Math.Max(50, options.Value.IntervalMs)));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                state.Beat();
                if (state.Beats % 10 == 0) logger.LogInformation("Pulse: {Beats} beats", state.Beats);
            }
        }
        catch (OperationCanceledException) { }
        logger.LogInformation("Pulse worker stopped after {Beats} beats", state.Beats);
    }
}

public sealed class StartupProbe(IOptions<PulseOptions> options) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        options.Value.FailOnStart ? throw new InvalidOperationException("Pulse:FailOnStart is true.") : Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

/// <summary>Stands in for a third-party library that wires itself into an application pipeline.</summary>
public static class PulseLibrary
{
    public static IApplicationBuilder UsePulseLibrary(this IApplicationBuilder app)
    {
        app.UseMiddleware<PulseHeaderMiddleware>();
        app.Use(async (context, next) => // inline middleware, short-circuits /ping
        {
            if (context.Request.Path == "/ping") { await context.Response.WriteAsync("pong"); return; }
            await next(context);
        });
        app.UseRouting();
        app.UseEndpoints(endpoints =>
        {
            endpoints.MapGet("/whoami", (HttpContext context) => new
            {
                Authenticated = context.User.Identity?.IsAuthenticated ?? false,
                Name = context.User.Identity?.Name ?? context.User.FindFirst("sub")?.Value,
                Roles = context.User.FindAll("role").Select(c => c.Value).ToArray(),
                PathBase = context.Request.PathBase.Value,
                Path = context.Request.Path.Value,
                Endpoint = context.GetEndpoint()?.DisplayName
            });
            endpoints.MapGet("/beats", (PulseState state) => new { state.Beats, state.StartedAt });
            endpoints.MapPost("/echo/{word}", (string word, EchoBody body) => new { Word = word, body.Text });
        });
        return app;
    }
}

public sealed record EchoBody(string Text);

/// <summary>Conventional middleware activated from the module's container.</summary>
public sealed class PulseHeaderMiddleware(RequestDelegate next, PulseState state)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Pulse-Beats"] = state.Beats.ToString();
        return next(context);
    }
}

public sealed class PulseEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/status", (PulseState state) => new { state.Beats, state.StartedAt, Module = "carter route" })
            .AllowAnonymous()
            .TenantOptional();
    }
}
