using System.Collections.Concurrent;
using System.Runtime.Loader;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Overlay container for one runtime module. The host's container is built (and frozen) at startup, so a module
/// loaded later registers its services here; anything the module does not register falls back to the host.
/// <para>
/// Rule that keeps modules unloadable: a service type that mentions a module type (GreetingService,
/// ILogger&lt;GreetingService&gt;, IOptions&lt;GreetingOptions&gt;) is always built here — from the module's
/// registrations or from the host's open-generic ones — and the host is never asked about it, because the host
/// container caches every type it is asked for and would keep the module's load context alive.
/// </para>
/// </summary>
internal sealed class ModuleContainer : IAsyncDisposable
{
    private readonly ServiceDescriptor[] _module;
    private readonly ServiceDescriptor[] _hostOpenGenerics;
    private readonly IServiceProviderIsService? _hostIsService;
    private readonly AssemblyLoadContext _context;
    private readonly ConcurrentDictionary<Type, bool> _moduleTypes = new();
    private readonly ConcurrentDictionary<(ServiceDescriptor, Type), Lazy<object?>> _singletons = new();

    public ModuleContainer(IServiceCollection module, IEnumerable<ServiceDescriptor> host, IServiceProvider hostRoot, AssemblyLoadContext context)
    {
        if (module.Any(d => d.IsKeyedService))
            throw new ModuleException("Keyed services are not supported in runtime modules yet.");

        _module = module.ToArray();
        _hostOpenGenerics = host.Where(d => !d.IsKeyedService && d.ServiceType.IsGenericTypeDefinition).ToArray();
        _hostIsService = hostRoot.GetService<IServiceProviderIsService>();
        _context = context;
        Root = new ModuleScope(this, hostRoot, isRoot: true);
    }

    /// <summary>Resolves singletons; used as the endpoint builder's service provider.</summary>
    public ModuleScope Root { get; }

    /// <summary>Per-request scope layered over the host's request scope.</summary>
    public ModuleScope CreateScope(IServiceProvider hostScope) => new(this, hostScope, isRoot: false);

    public bool IsModuleType(Type type) => _moduleTypes.GetOrAdd(type, t =>
        t.HasElementType
            ? IsModuleType(t.GetElementType()!)
            : AssemblyLoadContext.GetLoadContext(t.Assembly) == _context
              || (t.IsConstructedGenericType && t.GenericTypeArguments.Any(IsModuleType)));

    /// <summary>The registration used for a single resolution, or null when the host should answer.</summary>
    public ServiceDescriptor? Single(Type type)
    {
        var closed = Array.FindLast(_module, d => d.ServiceType == type);
        if (closed is not null || !type.IsConstructedGenericType) return closed;

        var definition = type.GetGenericTypeDefinition();
        var moduleOpen = Array.FindLast(_module, d => d.ServiceType == definition && Closes(d, type));
        if (IsModuleType(type))
            return moduleOpen ?? Array.FindLast(_hostOpenGenerics, d => d.ServiceType == definition && Closes(d, type));

        // A host type: the host wins unless it cannot build it at all.
        return moduleOpen is not null && _hostIsService?.IsService(type) != true ? moduleOpen : null;
    }

    /// <summary>The module-side registrations for an IEnumerable&lt;T&gt; resolution.</summary>
    public IEnumerable<ServiceDescriptor> All(Type type)
    {
        var closed = _module.Where(d => d.ServiceType == type);
        if (!type.IsConstructedGenericType || !IsModuleType(type)) return closed;

        var definition = type.GetGenericTypeDefinition();
        return _hostOpenGenerics.Where(d => d.ServiceType == definition && Closes(d, type))
            .Concat(closed)
            .Concat(_module.Where(d => d.ServiceType == definition && Closes(d, type)));
    }

    internal object? Singleton(ServiceDescriptor descriptor, Type type) =>
        _singletons.GetOrAdd((descriptor, type), key => new Lazy<object?>(() => Root.Create(key.Item1, key.Item2))).Value;

    internal static Type Implementation(ServiceDescriptor descriptor, Type type) =>
        descriptor.ImplementationType!.IsGenericTypeDefinition
            ? descriptor.ImplementationType.MakeGenericType(type.GenericTypeArguments)
            : descriptor.ImplementationType;

    private static bool Closes(ServiceDescriptor descriptor, Type type)
    {
        if (descriptor.ImplementationType is not { IsGenericTypeDefinition: true } open) return true;
        try { open.MakeGenericType(type.GenericTypeArguments); return true; }
        catch (ArgumentException) { return false; } // generic constraint not satisfied
    }

    public ValueTask DisposeAsync()
    {
        _singletons.Clear();
        _moduleTypes.Clear();
        return Root.DisposeAsync();
    }
}

internal sealed class ModuleScope : IServiceProvider, IServiceScope, IServiceScopeFactory, IServiceProviderIsService, IAsyncDisposable
{
    private static readonly Type[] Self = [typeof(IServiceProvider), typeof(IServiceScopeFactory), typeof(IServiceProviderIsService)];

    private readonly ModuleContainer _container;
    private readonly IServiceProvider _host;
    private readonly IServiceProviderIsService? _hostIsService;
    private readonly bool _isRoot;
    private readonly IServiceScope? _ownedHostScope;
    private readonly Dictionary<(ServiceDescriptor, Type), object?> _scoped = new();
    private readonly List<object> _disposables = [];
    private bool _disposed;

    internal ModuleScope(ModuleContainer container, IServiceProvider host, bool isRoot, IServiceScope? ownedHostScope = null)
    {
        _container = container;
        _host = host;
        _hostIsService = host.GetService<IServiceProviderIsService>();
        _isRoot = isRoot;
        _ownedHostScope = ownedHostScope;
    }

    public IServiceProvider ServiceProvider => this;

    public object? GetService(Type type)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (Array.IndexOf(Self, type) >= 0) return this;
        if (type.IsConstructedGenericType && type.GetGenericTypeDefinition() == typeof(IEnumerable<>))
            return ResolveAll(type.GenericTypeArguments[0]);

        var descriptor = _container.Single(type);
        if (descriptor is not null) return Resolve(descriptor, type);
        return _container.IsModuleType(type) ? null : _host.GetService(type);
    }

    public bool IsService(Type type) =>
        Array.IndexOf(Self, type) >= 0
        || (type.IsConstructedGenericType && type.GetGenericTypeDefinition() == typeof(IEnumerable<>))
        || _container.Single(type) is not null
        || (!_container.IsModuleType(type) && _hostIsService?.IsService(type) == true);

    public IServiceScope CreateScope()
    {
        var hostScope = _host.GetRequiredService<IServiceScopeFactory>().CreateScope();
        return new ModuleScope(_container, hostScope.ServiceProvider, isRoot: false, hostScope);
    }

    private Array ResolveAll(Type item)
    {
        IEnumerable<object?> fromHost = _container.IsModuleType(item) ? [] : _host.GetServices(item);
        var items = fromHost.Concat(_container.All(item).Select(d => Resolve(d, item))).ToArray();
        var result = Array.CreateInstance(item, items.Length);
        Array.Copy(items, result, items.Length);
        return result;
    }

    private object? Resolve(ServiceDescriptor descriptor, Type type)
    {
        switch (descriptor.Lifetime)
        {
            case ServiceLifetime.Singleton:
                return _container.Singleton(descriptor, type);
            case ServiceLifetime.Scoped:
                if (_isRoot) throw new InvalidOperationException($"Cannot resolve scoped service '{type}' from the module's root provider.");
                lock (_scoped)
                {
                    if (!_scoped.TryGetValue((descriptor, type), out var instance))
                        _scoped[(descriptor, type)] = instance = Create(descriptor, type);
                    return instance;
                }
            default:
                return Create(descriptor, type);
        }
    }

    internal object? Create(ServiceDescriptor descriptor, Type type)
    {
        if (descriptor.ImplementationInstance is { } instance) return instance; // owned by whoever created it

        var created = descriptor.ImplementationFactory is { } factory
            ? factory(this)
            : ActivatorUtilities.CreateInstance(this, ModuleContainer.Implementation(descriptor, type));

        if (created is IDisposable or IAsyncDisposable)
            lock (_disposables) _disposables.Add(created);
        return created;
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        object[] items;
        lock (_disposables) { items = [.. _disposables]; _disposables.Clear(); }
        for (var i = items.Length - 1; i >= 0; i--)
        {
            if (items[i] is IAsyncDisposable asyncDisposable) await asyncDisposable.DisposeAsync();
            else ((IDisposable)items[i]).Dispose();
        }
        lock (_scoped) _scoped.Clear();

        if (_ownedHostScope is IAsyncDisposable ownedAsync) await ownedAsync.DisposeAsync();
        else _ownedHostScope?.Dispose();
    }

    public void Dispose() => DisposeAsync().AsTask().GetAwaiter().GetResult();
}
