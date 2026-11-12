using System.Diagnostics;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// The <see cref="IHostedService"/>s one loaded module copy registered in its own <c>ConfigureServices</c>. The host's
/// generic host only knows the services registered at startup, so the runtime runs these itself:
/// <list type="bullet">
/// <item>Started after the copy is loaded, on Api and Worker pools; on a swap, after the old copy was stopped
/// (no overlap of two copies' consumers or schedulers).</item>
/// <item>Stopped in reverse order, awaited, within <see cref="ModuleRuntimeOptions.HostedServiceTimeout"/>, before
/// the module's container is disposed: unload, swap, host shutdown.</item>
/// <item>A failing service (constructor, <c>StartAsync</c>, a faulted <c>BackgroundService.ExecuteTask</c>, a stop
/// timeout) is logged and reported in the module listing; it never stops the host or the other services.</item>
/// </list>
/// Only names and messages are kept for the listing, never types, so the report cannot pin the module.
/// </summary>
internal sealed class ModuleHostedServices(string moduleId, ModuleContainer container, ILogger log)
{
    private readonly List<Entry> _entries = [];
    private bool _started;

    public IReadOnlyList<HostedServiceStatus> Describe()
    {
        lock (_entries) return _entries.Select(e => e.Describe()).ToArray();
    }

    /// <summary>Resolves and starts the module's hosted services. Never throws; failures are recorded per service.</summary>
    public async Task StartAsync(TimeSpan timeout)
    {
        if (_started) return;
        _started = true;

        // Start on a clean ExecutionContext, as the generic host does: a BackgroundService started from the
        // activation request would otherwise run forever with that request's AsyncLocals (HttpContext, Activity, tenant).
        Task start;
        using (ExecutionContext.SuppressFlow()) start = Task.Run(() => StartAllAsync(timeout));
        await start;
    }

    private async Task StartAllAsync(TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        foreach (var descriptor in container.All(typeof(IHostedService)).ToArray())
        {
            var entry = new Entry(Name(descriptor));
            lock (_entries) _entries.Add(entry);
            try
            {
                entry.Service = (IHostedService?)container.Root.Resolve(descriptor, typeof(IHostedService))
                    ?? throw new InvalidOperationException("The registration resolved to null.");
                entry.Name = entry.Service.GetType().FullName ?? entry.Name;

                var service = entry.Service;
                var lifecycle = service as IHostedLifecycleService;
                var stopwatch = Stopwatch.StartNew();
                var task = Task.Run(async () =>
                {
                    if (lifecycle is not null) await lifecycle.StartingAsync(cts.Token);
                    await service.StartAsync(cts.Token);
                    if (lifecycle is not null) await lifecycle.StartedAsync(cts.Token);
                });
                await task.WaitAsync(Remaining(timeout, stopwatch.Elapsed));
                entry.Set(HostedServiceState.Running);

                if (service is BackgroundService { ExecuteTask: { IsCompleted: false } execute })
                    _ = execute.ContinueWith(t => Completed(entry, t), CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                else if (service is BackgroundService { ExecuteTask: { } done })
                    Completed(entry, done);

                log.LogInformation("Module {Id}: started hosted service {Service}", moduleId, entry.Name);
            }
            catch (TimeoutException)
            {
                entry.Set(HostedServiceState.StartTimedOut, $"StartAsync did not finish within {timeout.TotalSeconds:0.#} s.");
                log.LogError("Module {Id}: hosted service {Service} did not start within {Timeout}", moduleId, entry.Name, timeout);
            }
            catch (Exception e)
            {
                entry.Set(HostedServiceState.StartFailed, e.GetBaseException().Message);
                log.LogError(e, "Module {Id}: hosted service {Service} failed to start", moduleId, entry.Name);
            }
        }
    }

    private void Completed(Entry entry, Task execute)
    {
        if (execute.IsFaulted)
        {
            var error = execute.Exception!.GetBaseException();
            if (entry.TrySet(HostedServiceState.Running, HostedServiceState.Faulted, error.Message))
                log.LogError(error, "Module {Id}: hosted service {Service} faulted", moduleId, entry.Name);
        }
        else if (entry.TrySet(HostedServiceState.Running, HostedServiceState.Completed, null))
        {
            log.LogInformation("Module {Id}: hosted service {Service} completed", moduleId, entry.Name);
        }
    }

    /// <summary>
    /// Stops the services that were started, in reverse order, within one shared timeout. Never throws.
    /// Returns a note when something did not stop cleanly: a service still running can keep the module loaded.
    /// </summary>
    public async Task<string?> StopAsync(TimeSpan timeout)
    {
        Entry[] entries;
        lock (_entries) entries = [.. _entries];
        if (entries.Length == 0) return null;

        var problems = new List<string>();
        var stopwatch = Stopwatch.StartNew();
        using var cts = new CancellationTokenSource(timeout);
        for (var i = entries.Length - 1; i >= 0; i--)
        {
            var entry = entries[i];
            if (entry.Service is not { } service || entry.State is HostedServiceState.StartFailed) continue;

            var lifecycle = service as IHostedLifecycleService;
            try
            {
                var task = Task.Run(async () =>
                {
                    if (lifecycle is not null) await lifecycle.StoppingAsync(cts.Token);
                    await service.StopAsync(cts.Token);
                    if (lifecycle is not null) await lifecycle.StoppedAsync(cts.Token);
                });
                await task.WaitAsync(Remaining(timeout, stopwatch.Elapsed));
                entry.Set(HostedServiceState.Stopped);
            }
            catch (TimeoutException)
            {
                entry.Set(HostedServiceState.StopTimedOut, $"StopAsync did not finish within {timeout.TotalSeconds:0.#} s.");
                problems.Add($"{entry.Name} did not stop within {timeout.TotalSeconds:0.#} s");
                log.LogError("Module {Id}: hosted service {Service} did not stop within {Timeout}; it may keep the module loaded", moduleId, entry.Name, timeout);
            }
            catch (Exception e)
            {
                entry.Set(HostedServiceState.StopFailed, e.GetBaseException().Message);
                problems.Add($"{entry.Name} failed to stop: {e.GetBaseException().Message}");
                log.LogError(e, "Module {Id}: hosted service {Service} failed to stop", moduleId, entry.Name);
            }
            entry.Service = null; // the container disposes it next
        }
        log.LogInformation("Module {Id}: stopped {Count} hosted services in {Elapsed} ms", moduleId, entries.Length, stopwatch.ElapsedMilliseconds);
        return problems.Count == 0 ? null : "Hosted services: " + string.Join("; ", problems) + ".";
    }

    private static TimeSpan Remaining(TimeSpan timeout, TimeSpan elapsed) =>
        timeout > elapsed ? timeout - elapsed : TimeSpan.Zero;

    private static string Name(ServiceDescriptor descriptor) =>
        descriptor.ImplementationType?.FullName
        ?? descriptor.ImplementationInstance?.GetType().FullName
        ?? "(factory)";

    private sealed class Entry(string name)
    {
        private readonly Lock _gate = new();
        private HostedServiceState _state = HostedServiceState.Starting;
        private string? _error;

        public string Name { get; set; } = name;
        public IHostedService? Service { get; set; }
        public HostedServiceState State { get { lock (_gate) return _state; } }

        public void Set(HostedServiceState state, string? error = null)
        {
            lock (_gate)
            {
                // A fault seen while running stays visible after the stop.
                if (state == HostedServiceState.Stopped && _state is HostedServiceState.Faulted or HostedServiceState.Completed) return;
                (_state, _error) = (state, error);
            }
        }

        public bool TrySet(HostedServiceState expected, HostedServiceState state, string? error)
        {
            lock (_gate)
            {
                if (_state != expected) return false;
                (_state, _error) = (state, error);
                return true;
            }
        }

        public HostedServiceStatus Describe()
        {
            lock (_gate) return new HostedServiceStatus(Name, _state, _error);
        }
    }
}

[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter<HostedServiceState>))]
public enum HostedServiceState { Starting, Running, Completed, Faulted, StartFailed, StartTimedOut, Stopped, StopFailed, StopTimedOut }

/// <summary>One hosted service of a loaded module, as reported by <c>GET /api/admin/modules</c>.</summary>
public sealed record HostedServiceStatus(string Service, HostedServiceState State, string? Error);
