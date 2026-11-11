using System.Collections.Concurrent;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.Tenancy;

/// <summary>
/// Runs a loaded module's <see cref="IModuleActivation"/> services once, then its <see cref="ITenantInitializer"/>s
/// (database migrations, seeding) for every active tenant, in the background. Tenants added or re-activated later are
/// initialized when the directory reports them. Requests to the module wait for their tenant's initialization
/// (<see cref="ReadyAsync"/>); a failed one is retried on the next request.
/// <para>Unload safety: everything about a module copy is dropped, and its work cancelled and awaited, before the
/// runtime disposes its container.</para>
/// </summary>
internal sealed class ModuleTenantInitializer : IModuleLifecycleObserver
{
    private readonly TenantDirectory _directory;
    private readonly ILogger<ModuleTenantInitializer> _log;
    private readonly ConcurrentDictionary<IServiceProvider, Entry> _entries = new(ReferenceEqualityComparer.Instance);
    private readonly ConcurrentDictionary<string, Entry> _current = new(StringComparer.OrdinalIgnoreCase);

    public ModuleTenantInitializer(TenantDirectory directory, ILogger<ModuleTenantInitializer> log)
    {
        _directory = directory;
        _log = log;
        directory.Changed += OnTenantChanged;
    }

    public void Loaded(string moduleId, IServiceProvider moduleServices)
    {
        var entry = new Entry(moduleId, moduleServices);
        entry.Activation = Task.Run(() => ActivateAsync(entry));
        _entries[moduleServices] = entry;
        _current[moduleId] = entry;

        // Eagerly for every active tenant the directory knows (or will know once it has loaded).
        _ = Task.Run(async () =>
        {
            try { await _directory.Ready.WaitAsync(entry.Stopping.Token); }
            catch (OperationCanceledException) { return; }
            foreach (var tenant in _directory.All.Where(t => t.IsActive))
                _ = Start(entry, tenant, replace: false);
        });
    }

    public async Task ReleasingAsync(string moduleId, IServiceProvider moduleServices)
    {
        if (!_entries.TryRemove(moduleServices, out var entry)) return;
        _current.TryRemove(new KeyValuePair<string, Entry>(moduleId, entry));
        await entry.Stopping.CancelAsync();

        Task[] running = [entry.Activation ?? Task.CompletedTask, .. entry.Tenants.Values];
        try { await Task.WhenAll(running).WaitAsync(TimeSpan.FromSeconds(30)); }
        catch { } // failures were logged where they happened; a timeout only delays the unload
        entry.Tenants.Clear();
        entry.Activation = null;
        entry.Stopping.Dispose();
    }

    /// <summary>Completes when the module is ready to serve <paramref name="tenant"/>; faults when its initialization failed.</summary>
    public Task ReadyAsync(string moduleId, TenantInfo tenant)
    {
        if (!_current.TryGetValue(moduleId, out var entry)) return Task.CompletedTask;
        var task = entry.Tenants.GetOrAdd(tenant.Id, _ => Initialize(entry, tenant));
        return task.IsFaulted ? Start(entry, tenant, replace: true) : task;
    }

    private void OnTenantChanged(TenantInfo tenant)
    {
        if (!tenant.IsActive) return;
        foreach (var entry in _entries.Values) _ = Start(entry, tenant, replace: true);
    }

    private Task Start(Entry entry, TenantInfo tenant, bool replace)
    {
        if (!replace) return entry.Tenants.GetOrAdd(tenant.Id, _ => Initialize(entry, tenant));
        var task = Initialize(entry, tenant);
        entry.Tenants[tenant.Id] = task;
        return task;
    }

    private async Task ActivateAsync(Entry entry)
    {
        foreach (var activation in entry.Services.GetServices<IModuleActivation>())
        {
            try { await activation.ActivatedAsync(entry.Stopping.Token); }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _log.LogError(e, "Activation {Activation} of module {Module} failed", activation.GetType().Name, entry.ModuleId);
            }
        }
    }

    private async Task Initialize(Entry entry, TenantInfo tenant)
    {
        await Task.Yield();
        var ct = entry.Stopping.Token;
        if (entry.Activation is { } activation) await activation.WaitAsync(ct);

        foreach (var initializer in entry.Services.GetServices<ITenantInitializer>())
        {
            try { await initializer.InitializeAsync(tenant, ct); }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _log.LogError(e, "Initializing module {Module} for tenant {Tenant} failed ({Initializer})", entry.ModuleId, tenant.Id, initializer.GetType().Name);
                throw;
            }
        }
    }

    private sealed class Entry(string moduleId, IServiceProvider services)
    {
        public string ModuleId { get; } = moduleId;
        public IServiceProvider Services { get; } = services;
        public CancellationTokenSource Stopping { get; } = new();
        public Task? Activation { get; set; }
        public ConcurrentDictionary<string, Task> Tenants { get; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
