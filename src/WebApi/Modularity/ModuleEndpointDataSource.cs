using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.Extensions.Primitives;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Endpoints of the runtime modules that are active right now. Added to the app's data sources once at startup;
/// every change signals the change token, and routing (and the API explorer, through
/// <see cref="IActionDescriptorChangeProvider"/>) rebuilds without a restart.
/// </summary>
internal sealed class ModuleEndpointDataSource : EndpointDataSource, IActionDescriptorChangeProvider
{
    private readonly Lock _gate = new();
    private Dictionary<string, IReadOnlyList<Endpoint>> _modules = new(StringComparer.OrdinalIgnoreCase);
    private IReadOnlyList<Endpoint> _endpoints = [];
    private CancellationTokenSource _changed = new();
    private IChangeToken _token;

    public ModuleEndpointDataSource() => _token = new CancellationChangeToken(_changed.Token);

    public override IReadOnlyList<Endpoint> Endpoints => _endpoints;

    public override IChangeToken GetChangeToken() => _token;

    public void Set(string moduleId, IReadOnlyList<Endpoint> endpoints) => Update(modules => modules[moduleId] = endpoints);

    public void Remove(string moduleId) => Update(modules => modules.Remove(moduleId));

    public IReadOnlyList<string> Describe(string moduleId) =>
        _modules.TryGetValue(moduleId, out var endpoints)
            ? endpoints.OfType<RouteEndpoint>()
                .Select(e => $"{string.Join(',', e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["*"])} {e.RoutePattern.RawText}")
                .ToArray()
            : [];

    private void Update(Action<Dictionary<string, IReadOnlyList<Endpoint>>> change)
    {
        CancellationTokenSource previous;
        lock (_gate)
        {
            var modules = new Dictionary<string, IReadOnlyList<Endpoint>>(_modules, StringComparer.OrdinalIgnoreCase);
            change(modules);
            _modules = modules;
            _endpoints = modules.Values.SelectMany(e => e).ToArray();
            previous = _changed;
            _changed = new CancellationTokenSource();
            _token = new CancellationChangeToken(_changed.Token);
        }
        previous.Cancel();
        previous.Dispose();
    }
}

/// <summary>Collects the endpoints a module's ICarterModule types map, outside the app's own route table.</summary>
internal sealed class ModuleRouteBuilder(IServiceProvider services) : IEndpointRouteBuilder
{
    public IServiceProvider ServiceProvider => services;
    public ICollection<EndpointDataSource> DataSources { get; } = new List<EndpointDataSource>();
    public IApplicationBuilder CreateApplicationBuilder() => new ApplicationBuilder(services);
}

/// <summary>Endpoint metadata that marks which runtime module owns an endpoint.</summary>
public sealed record RuntimeModuleMetadata(string ModuleId, string Version);
