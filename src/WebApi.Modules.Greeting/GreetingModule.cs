using Carter;
using Humanizer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;

namespace soft.square.net.WebApi.Modules.Greeting;

public sealed class GreetingModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("greeting", "Greeting", "1.0.0", "greeting")
    {
        Description = "Sample runtime module: own services, options, a private dependency and Carter endpoints.",
        DefaultSettings = new Dictionary<string, string?> { ["Greeting:Prefix"] = "Hello" }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<GreetingOptions>(settings.GetSection("Greeting"));
        services.AddSingleton<GreetingCounter>();
        services.AddScoped<GreetingService>();
    }
}

public sealed class GreetingOptions
{
    public string Prefix { get; set; } = "Hi";
}

/// <summary>Module singleton: survives across requests, disposed with the module.</summary>
public sealed class GreetingCounter
{
    private int _count;
    public int Next() => Interlocked.Increment(ref _count);
}

/// <summary>Module scoped service using module options and a host service (ILogger).</summary>
public sealed class GreetingService(IOptions<GreetingOptions> options, GreetingCounter counter, ILogger<GreetingService> logger)
{
    private static readonly DateTimeOffset LoadedAt = DateTimeOffset.UtcNow;

    public GreetingResponse Greet(string name)
    {
        var count = counter.Next();
        logger.LogInformation("Greeting #{Count} for {Name}", count, name);
        return new GreetingResponse($"{options.Value.Prefix}, {name.Humanize(LetterCasing.Title)}!", count, $"module loaded {LoadedAt.Humanize()}");
    }
}

public sealed record GreetingResponse(string Message, int Count, string Loaded);

public sealed record EchoRequest(string Text);

public sealed class GreetingEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/", (GreetingService greetings) => greetings.Greet("world"));
        app.MapGet("/{name}", (string name, GreetingService greetings) => greetings.Greet(name));
        app.MapPost("/echo", (EchoRequest request) => Results.Ok(request with { Text = request.Text.Pascalize() }));
    }
}
