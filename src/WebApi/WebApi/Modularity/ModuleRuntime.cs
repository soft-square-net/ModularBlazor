using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Carter;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;

namespace soft.square.net.WebApi.Modularity;

public sealed class ModuleRuntimeOptions
{
    /// <summary>Module store folder (packages + modules.json), relative to the content root.</summary>
    public string Path { get; set; } = "App_Data/modules";

    /// <summary>Base route; a module with RoutePrefix "greeting" is served under /api/greeting.</summary>
    public string RoutePrefix { get; set; } = "/api";

    /// <summary>Name of the pool this instance belongs to (same image, different configuration per pool).</summary>
    public string Pool { get; set; } = "all";

    /// <summary>Api: modules get HTTP routes. Worker: modules are loaded (services, consumers) but get no routes.</summary>
    public ModuleRole Role { get; set; } = ModuleRole.Api;

    /// <summary>Module ids this pool may activate; empty = every module.</summary>
    public string[] Enabled { get; set; } = [];

    /// <summary>Core module packages shipped with this release (one folder per module), relative to the app base directory.</summary>
    public string CorePath { get; set; } = "CoreModules";

    public bool IsEnabled(string moduleId) =>
        Enabled.Length == 0 || Enabled.Contains(moduleId, StringComparer.OrdinalIgnoreCase);
}

public enum ModuleRole { Api, Worker }

/// <summary>The host's IServiceCollection, kept so module containers can reuse its open-generic registrations.</summary>
internal sealed class HostServices(IServiceCollection services)
{
    public IServiceCollection Services => services;
}

/// <summary>
/// Module lifecycle: Install (store package, read manifest, register) → Activate (load assembly, build services,
/// map routes) → Deactivate (remove routes) → Unload (dispose services, unload the load context) → Uninstall.
/// <para>
/// The catalog (modules.json + packages) is shared by every replica of every pool. A lifecycle call changes the
/// module's desired state in the catalog under a cross-process lock, applies it on this replica, then publishes
/// <see cref="ModuleStateChanged"/>; every replica re-reads the catalog and converges in <see cref="SyncAsync"/>:
/// Active → loaded with routes (only where the pool enables the module), Inactive → no routes, Installed → unloaded,
/// removed or re-installed → unloaded (and re-applied).
/// </para>
/// </summary>
internal sealed partial class ModuleRuntime
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, ModuleRecord> _records = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, WeakReference> _unloading = new();
    private readonly ModuleRegistryStore _store;
    private readonly string _root;
    private readonly string _routeBase;
    private readonly ModuleEndpointDataSource _endpoints;
    private readonly HostServices _host;
    private readonly IServiceProvider _hostRoot;
    private readonly IModuleStateBus _bus;
    private readonly ILogger<ModuleRuntime> _log;
    private readonly ModuleRuntimeOptions _options;

    public ModuleRuntime(IOptions<ModuleRuntimeOptions> options, IHostEnvironment environment, ModuleEndpointDataSource endpoints,
        HostServices host, IServiceProvider hostRoot, IModuleStateBus bus, ILogger<ModuleRuntime> log)
    {
        _options = options.Value;
        _root = Path.GetFullPath(options.Value.Path, environment.ContentRootPath);
        _routeBase = "/" + options.Value.RoutePrefix.Trim('/');
        Directory.CreateDirectory(_root);
        _store = new ModuleRegistryStore(Path.Combine(_root, "modules.json"));
        _endpoints = endpoints;
        _host = host;
        _hostRoot = hostRoot;
        _bus = bus;
        _log = log;
    }

    public async Task<IReadOnlyList<ModuleStatus>> ListAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            using (await _store.LockAsync(ct)) ReloadRecords();
            return _records.Values.OrderBy(r => r.Id).Select(Status).ToArray();
        }
        finally { _gate.Release(); }
    }

    public async Task<ModuleRecord> InstallAsync(Stream content, string fileName, CancellationToken ct)
    {
        var staging = Path.Combine(_root, ".staging", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(staging);
        ModuleRecord record;
        try
        {
            await ExtractAsync(content, fileName, staging, ct);
            var (entry, manifest) = Inspect(staging);
            Validate(manifest);

            await _gate.WaitAsync(ct);
            try
            {
                using (await _store.LockAsync(ct))
                {
                    ReloadRecords();
                    if (_records.TryGetValue(manifest.Id, out var existing) && existing.Core)
                        throw new ModuleException($"'{manifest.Id}' is a core module; it is upgraded only by a WebApi release.", StatusCodes.Status409Conflict);
                    var clash = _records.Values.FirstOrDefault(r => r.Id != manifest.Id && r.RoutePrefix.Equals(manifest.RoutePrefix.Trim('/'), StringComparison.OrdinalIgnoreCase));
                    if (clash is not null)
                        throw new ModuleException($"Route prefix '{manifest.RoutePrefix}' is already used by module '{clash.Id}'.", StatusCodes.Status409Conflict);

                    // Replicas load packages from bytes, so replacing the files of a loaded module is safe; every replica
                    // sees the new InstalledAt on its next sync, unloads the old version and re-applies the desired state.
                    var moduleFolder = Path.Combine(_root, manifest.Id);
                    if (Directory.Exists(moduleFolder)) Directory.Delete(moduleFolder, recursive: true);
                    Directory.CreateDirectory(moduleFolder);
                    Directory.Move(staging, Path.Combine(moduleFolder, manifest.Version));

                    // Manifest defaults, keeping the admin's overrides for keys the new version still has.
                    var settings = new Dictionary<string, string?>(manifest.DefaultSettings);
                    _records.TryGetValue(manifest.Id, out var previous);
                    if (previous is not null)
                        foreach (var (key, value) in previous.Settings)
                            if (settings.ContainsKey(key)) settings[key] = value;

                    record = new ModuleRecord
                    {
                        Id = manifest.Id,
                        Name = manifest.Name,
                        Version = manifest.Version,
                        RoutePrefix = manifest.RoutePrefix.Trim('/'),
                        Description = manifest.Description,
                        EntryAssembly = entry,
                        Settings = settings,
                        DesiredState = previous?.DesiredState ?? ModuleState.Installed, // an upgrade keeps the module's state
                        InstalledAt = DateTimeOffset.UtcNow
                    };
                    _records[record.Id] = record;
                    _store.Save(_records.Values);
                }
            }
            finally { _gate.Release(); }
        }
        finally
        {
            if (Directory.Exists(staging)) Directory.Delete(staging, recursive: true);
        }

        _log.LogInformation("Installed module {Id} {Version} from {File}", record.Id, record.Version, fileName);
        await ApplyAndPublishAsync(record.Id, "installed", ct);
        return record;
    }

    public async Task<ModuleStatus> ActivateAsync(string id, CancellationToken ct)
    {
        var record = await SetDesiredStateAsync(id, ModuleState.Active, ct);
        var result = await ApplyAndPublishAsync(record.Id, "activated", ct);
        if (result.Errors.TryGetValue(record.Id, out var error)) throw error;
        return await StatusAsync(record.Id, ct);
    }

    public async Task<ModuleStatus> DeactivateAsync(string id, CancellationToken ct)
    {
        var record = await SetDesiredStateAsync(id, ModuleState.Inactive, ct);
        await ApplyAndPublishAsync(record.Id, "deactivated", ct);
        return await StatusAsync(record.Id, ct);
    }

    /// <summary>Unloads the module on every replica; the result describes this replica.</summary>
    public async Task<UnloadResult> UnloadAsync(string id, CancellationToken ct)
    {
        var record = await SetDesiredStateAsync(id, ModuleState.Installed, ct);
        var result = await ApplyAndPublishAsync(record.Id, "unloaded", ct);
        return result.Unloaded.TryGetValue(record.Id, out var unload)
            ? unload
            : new UnloadResult(record.Id, Unloaded: true, GcPasses: 0, Note: "The module was not loaded on this replica.");
    }

    /// <summary>Load contexts that were unloaded but not yet collected; runs a GC and drops the collected ones.</summary>
    public async Task<IReadOnlyList<string>> PendingUnloadsAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            foreach (var (key, context) in _unloading.ToArray())
                if (!context.IsAlive) _unloading.Remove(key);
            return _unloading.Keys.ToArray();
        }
        finally { _gate.Release(); }
    }

    public async Task<UnloadResult> UninstallAsync(string id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        string moduleId;
        try
        {
            using (await _store.LockAsync(ct))
            {
                ReloadRecords();
                var record = Get(id);
                if (record.Core)
                    throw new ModuleException($"'{record.Id}' is a core module and ships with the release; deactivate or unload it instead.", StatusCodes.Status409Conflict);
                moduleId = record.Id;
                _records.Remove(moduleId);
                _store.Save(_records.Values);
            }
        }
        finally { _gate.Release(); }

        var result = await ApplyAndPublishAsync(moduleId, "uninstalled", ct);
        var folder = Path.Combine(_root, moduleId);
        if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true); // every replica loaded it from bytes
        return result.Unloaded.TryGetValue(moduleId, out var unload)
            ? unload
            : new UnloadResult(moduleId, Unloaded: true, GcPasses: 0, Note: "The module was not loaded on this replica.");
    }

    /// <summary>Every replica that has the module loaded swaps to a copy configured with the new settings.</summary>
    public async Task<ModuleRecord> UpdateSettingsAsync(string id, Dictionary<string, string?> settings, CancellationToken ct)
    {
        ModuleRecord record;
        await _gate.WaitAsync(ct);
        try
        {
            using (await _store.LockAsync(ct))
            {
                ReloadRecords();
                record = Get(id);
                record.Settings = new Dictionary<string, string?>(settings);
                _store.Save(_records.Values);
            }
        }
        finally { _gate.Release(); }

        var result = await ApplyAndPublishAsync(record.Id, "configured", ct);
        if (result.Errors.TryGetValue(record.Id, out var error)) throw error;
        return record;
    }

    /// <summary>
    /// Registers the core modules shipped with this release (<see cref="ModuleRuntimeOptions.CorePath"/>) in the catalog.
    /// Runs on startup before the first sync, under the store lock, so concurrent replicas seed each module once.
    /// <list type="bullet">
    /// <item>Not in the catalog: installed as <see cref="ModuleState.Active"/>.</item>
    /// <item>In the catalog with another package hash and a version not newer than the shipped one: upgraded in place,
    /// keeping the admin's desired state and settings (like a re-install).</item>
    /// <item>The catalog holds a newer version (an older replica during a rolling release): left alone.</item>
    /// </list>
    /// Returns the ids that changed; the caller broadcasts so running replicas converge.
    /// </summary>
    public async Task<IReadOnlyList<string>> SeedCoreModulesAsync(CancellationToken ct)
    {
        var source = Path.GetFullPath(_options.CorePath, AppContext.BaseDirectory);
        if (!Directory.Exists(source)) return [];

        var changed = new List<string>();
        foreach (var folder in Directory.EnumerateDirectories(source).Order(StringComparer.OrdinalIgnoreCase))
        {
            string entry;
            ModuleManifest manifest;
            try
            {
                (entry, manifest) = Inspect(folder);
                Validate(manifest);
            }
            catch (Exception e) when (e is ModuleException or IOException or BadImageFormatException or TypeLoadException)
            {
                _log.LogError(e, "Core module package {Folder} is invalid; skipped", Path.GetFileName(folder));
                continue;
            }
            var hash = HashFolder(folder);

            await _gate.WaitAsync(ct);
            try
            {
                using (await _store.LockAsync(ct))
                {
                    ReloadRecords();
                    _records.TryGetValue(manifest.Id, out var previous);
                    if (previous is { Core: true } && previous.PackageHash == hash) continue;
                    if (previous is { Core: true } && CompareVersions(manifest.Version, previous.Version) < 0)
                    {
                        _log.LogInformation("Core module {Id}: catalog has {Catalog}, this release ships {Shipped}; keeping the newer one",
                            manifest.Id, previous.Version, manifest.Version);
                        continue;
                    }
                    if (previous is { Core: false })
                        _log.LogWarning("Uploaded module {Id} is replaced by the core module this release ships", manifest.Id);

                    var prefix = manifest.RoutePrefix.Trim('/');
                    var clash = _records.Values.FirstOrDefault(r => r.Id != manifest.Id && r.RoutePrefix.Equals(prefix, StringComparison.OrdinalIgnoreCase));
                    if (clash is not null)
                    {
                        _log.LogError("Core module {Id} not seeded: route prefix '{Prefix}' is used by module {Other}", manifest.Id, prefix, clash.Id);
                        continue;
                    }

                    var moduleFolder = Path.Combine(_root, manifest.Id);
                    if (Directory.Exists(moduleFolder)) Directory.Delete(moduleFolder, recursive: true); // replicas load from bytes
                    CopyFolder(folder, Path.Combine(moduleFolder, manifest.Version));

                    var settings = new Dictionary<string, string?>(manifest.DefaultSettings);
                    if (previous is not null)
                        foreach (var (key, value) in previous.Settings)
                            if (settings.ContainsKey(key)) settings[key] = value;

                    _records[manifest.Id] = new ModuleRecord
                    {
                        Id = manifest.Id,
                        Name = manifest.Name,
                        Version = manifest.Version,
                        RoutePrefix = prefix,
                        Description = manifest.Description,
                        EntryAssembly = entry,
                        Settings = settings,
                        DesiredState = previous?.DesiredState ?? ModuleState.Active,
                        InstalledAt = DateTimeOffset.UtcNow,
                        Core = true,
                        PackageHash = hash
                    };
                    _store.Save(_records.Values);
                    changed.Add(manifest.Id);
                    _log.LogInformation("Seeded core module {Id} {Version} ({Mode})", manifest.Id, manifest.Version, previous is null ? "new" : "upgrade");
                }
            }
            finally { _gate.Release(); }
        }
        return changed;
    }

    /// <summary>Tells every other replica that core modules were seeded (startup, after the first sync).</summary>
    public Task PublishCoreSeededAsync(IReadOnlyList<string> ids, CancellationToken ct) =>
        _bus.PublishAsync(new ModuleStateChanged(string.Join(',', ids), "core-seeded", _options.Pool, ModuleInstance.Id, DateTimeOffset.UtcNow), ct);

    /// <summary>
    /// Converges this replica on the catalog. Runs on startup, after each local lifecycle call and whenever another
    /// replica publishes <see cref="ModuleStateChanged"/>. Idempotent.
    /// </summary>
    public async Task<SyncResult> SyncAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            using (await _store.LockAsync(ct)) ReloadRecords();

            var result = new SyncResult();
            foreach (var (id, module) in _loaded.ToArray())
            {
                _records.TryGetValue(id, out var record);
                var wanted = record is not null && record.DesiredState != ModuleState.Installed && _options.IsEnabled(id);
                if (!wanted)
                {
                    result.Unloaded[id] = await UnloadLocalAsync(id, record?.Version ?? module.Version);
                }
                else if (module.InstalledAt != record!.InstalledAt || module.Settings != SettingsFingerprint(record))
                {
                    // Re-installed or re-configured: swap to a freshly loaded copy, then release the old one.
                    try { result.Unloaded[id] = await SwapAsync(record, module); }
                    catch (Exception e) when (e is ModuleException or IOException or BadImageFormatException or TypeLoadException or InvalidOperationException)
                    {
                        _log.LogError(e, "Module {Id} could not be reloaded in pool {Pool}; keeping the running copy", id, _options.Pool);
                        result.Errors[id] = e;
                    }
                }
            }

            foreach (var record in _records.Values.Where(r => _options.IsEnabled(r.Id)))
            {
                try
                {
                    if (record.DesiredState == ModuleState.Active) ActivateLocal(record);
                    else RemoveRoutes(record.Id);
                }
                catch (Exception e) when (e is ModuleException or IOException or BadImageFormatException or TypeLoadException or InvalidOperationException)
                {
                    _log.LogError(e, "Module {Id} could not reach its desired state {State} in pool {Pool}", record.Id, record.DesiredState, _options.Pool);
                    result.Errors[record.Id] = e;
                }
            }
            return result;
        }
        finally { _gate.Release(); }
    }

    private async Task<ModuleRecord> SetDesiredStateAsync(string id, ModuleState state, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            using (await _store.LockAsync(ct))
            {
                ReloadRecords();
                var record = Get(id);
                record.DesiredState = state;
                _store.Save(_records.Values);
                return record;
            }
        }
        finally { _gate.Release(); }
    }

    /// <summary>Applies the catalog here first, then tells every other replica to do the same.</summary>
    private async Task<SyncResult> ApplyAndPublishAsync(string moduleId, string action, CancellationToken ct)
    {
        var result = await SyncAsync(ct);
        await _bus.PublishAsync(new ModuleStateChanged(moduleId, action, _options.Pool, ModuleInstance.Id, DateTimeOffset.UtcNow), ct);
        return result;
    }

    private void ActivateLocal(ModuleRecord record)
    {
        if (!_loaded.TryGetValue(record.Id, out var module))
        {
            _loaded[record.Id] = module = Load(record);
            _log.LogInformation("Loaded module {Id} {Version} in pool {Pool} ({Role})", record.Id, record.Version, _options.Pool, _options.Role);
        }
        if (_options.Role != ModuleRole.Api || module.Routed) return;

        module.Endpoints ??= BuildEndpoints(record, module);
        _endpoints.Set(record.Id, module.Endpoints);
        module.Routed = true;
        _log.LogInformation("Mapped {Count} endpoints of module {Id} in pool {Pool}", module.Endpoints.Count, record.Id, _options.Pool);
    }

    private void RemoveRoutes(string id)
    {
        if (!_loaded.TryGetValue(id, out var module) || !module.Routed) return;
        _endpoints.Remove(id);
        module.Routed = false;
    }

    /// <summary>
    /// Blue/green on one replica: the new copy is loaded and its routes replace the old ones in a single data source
    /// update, so requests never see a 404 window; then the old copy is released.
    /// </summary>
    private async Task<UnloadResult> SwapAsync(ModuleRecord record, LoadedModule old)
    {
        var fresh = Load(record);
        try
        {
            if (_options.Role == ModuleRole.Api && record.DesiredState == ModuleState.Active)
            {
                fresh.Endpoints = BuildEndpoints(record, fresh);
                _endpoints.Set(record.Id, fresh.Endpoints); // replaces the old endpoints atomically
                fresh.Routed = true;
            }
            else
            {
                _endpoints.Remove(record.Id);
            }
        }
        catch
        {
            await ReleaseAsync(fresh, _hostRoot, _host.Services);
            throw;
        }

        _loaded[record.Id] = fresh;
        _log.LogInformation("Swapped module {Id} to {Version} ({InstalledAt}) in pool {Pool}", record.Id, record.Version, record.InstalledAt, _options.Pool);
        return await ReleaseLoadedAsync(record.Id, old.Version, old);
    }

    private async Task<UnloadResult> UnloadLocalAsync(string id, string version)
    {
        _endpoints.Remove(id);
        if (!_loaded.Remove(id, out var module))
            return new UnloadResult(id, Unloaded: true, GcPasses: 0, Note: "The module was not loaded on this replica.");
        return await ReleaseLoadedAsync(id, version, module);
    }

    /// <summary>Disposes a module copy that no longer has routes and waits for its load context to be collected.</summary>
    private async Task<UnloadResult> ReleaseLoadedAsync(string id, string version, LoadedModule? module)
    {
        // ApiExplorer keeps the last computed descriptions (module request/response types) until it is read
        // again; the routes are gone now, so recompute it without them.
        _ = _hostRoot.GetService<IApiDescriptionGroupCollectionProvider>()?.ApiDescriptionGroups;

        var context = await ReleaseAsync(module!, _hostRoot, _host.Services);
        module = null; // the async state machine would otherwise keep the module alive

        // Collection needs several GCs (the loader allocator is freed by finalizers) and other threads can briefly
        // hold the last references, so wait between passes instead of spinning.
        var passes = 0;
        for (; context.IsAlive && passes < 20; passes++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            if (context.IsAlive) await Task.Delay(50, CancellationToken.None);
        }

        var unloaded = !context.IsAlive;
        if (!unloaded) _unloading[$"{id}@{version}#{Guid.NewGuid():n}"] = context;
        _log.LogInformation("Unloaded module {Id} in pool {Pool}: {Result} after {Passes} GC passes", id, _options.Pool, unloaded ? "collected" : "still referenced", passes);
        return new UnloadResult(id, unloaded, passes,
            unloaded ? null : "Not collected yet; tracked under GET /api/admin/modules/unloading. If it never clears, something still references the module's types.");
    }

    private async Task<ModuleStatus> StatusAsync(string id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try { return Status(Get(id)); }
        finally { _gate.Release(); }
    }

    /// <summary>Settings the module was configured with; a change in the catalog makes replicas reload it.</summary>
    private static string SettingsFingerprint(ModuleRecord record) =>
        string.Join('\n', record.Settings.OrderBy(s => s.Key, StringComparer.Ordinal).Select(s => $"{s.Key}={s.Value}"));

    /// <summary>Caller holds the store lock.</summary>
    private void ReloadRecords() =>
        _records = _store.Load().ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);

    private LoadedModule Load(ModuleRecord record)
    {
        var entry = Path.Combine(_root, record.Id, record.Version, record.EntryAssembly);
        if (!File.Exists(entry))
            throw new ModuleException($"The package files of '{record.Id}' are missing.", StatusCodes.Status500InternalServerError);

        var context = new ModuleLoadContext($"module:{record.Id}@{record.Version}", entry);
        try
        {
            var assembly = context.LoadWithoutLock(entry);
            var type = FindModuleType(assembly)
                ?? throw new ModuleException($"{record.EntryAssembly} no longer contains an IRuntimeModule.", StatusCodes.Status500InternalServerError);
            var module = (IRuntimeModule)Activator.CreateInstance(type)!;

            var services = new ServiceCollection();
            var settings = new ConfigurationBuilder().AddInMemoryCollection(record.Settings).Build();
            module.ConfigureServices(services, settings);

            // The module's own JsonOptions, configured exactly like the host's. Minimal API caches JSON metadata for
            // the module's request/response types inside these options; in the host's singleton they would pin the
            // module's assemblies forever.
            var json = new OptionsFactory<JsonOptions>(
                    _hostRoot.GetServices<IConfigureOptions<JsonOptions>>(),
                    _hostRoot.GetServices<IPostConfigureOptions<JsonOptions>>())
                .Create(Options.DefaultName);
            services.AddSingleton<IOptions<JsonOptions>>(Options.Create(json));

            var container = new ModuleContainer(services, _host.Services, _hostRoot, context);
            var routeModules = LoadableTypes(assembly)
                .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(ICarterModule).IsAssignableFrom(t))
                .ToArray();
            var loaded = new LoadedModule(context, container, routeModules, record);
            // Tenancy (per-tenant initialization) and other host observers; they let go in ReleaseAsync.
            foreach (var observer in _hostRoot.GetServices<IModuleLifecycleObserver>()) observer.Loaded(record.Id, container.Root);
            return loaded;
        }
        catch
        {
            context.Unload();
            throw;
        }
    }

    private IReadOnlyList<Endpoint> BuildEndpoints(ModuleRecord record, LoadedModule module)
    {
        var builder = new ModuleRouteBuilder(module.Container.Root);
        var group = builder.MapGroup($"{_routeBase}/{record.RoutePrefix}")
            .WithTags(record.Name)
            .WithMetadata(new RuntimeModuleMetadata(record.Id, record.Version));

        foreach (var type in module.RouteModules)
            ((ICarterModule)ActivatorUtilities.CreateInstance(module.Container.Root, type)).AddRoutes(group);

        return builder.DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => WithModuleServices(endpoint, module.Container))
            .ToArray();
    }

    /// <summary>Runs the endpoint with RequestServices swapped for a module scope layered over the request scope.</summary>
    private static RouteEndpoint WithModuleServices(RouteEndpoint endpoint, ModuleContainer container)
    {
        var inner = endpoint.RequestDelegate ?? throw new InvalidOperationException($"Endpoint '{endpoint.DisplayName}' has no request delegate.");
        return new RouteEndpoint(async context =>
        {
            var hostServices = context.RequestServices;
            await using var scope = container.CreateScope(hostServices);
            context.RequestServices = scope;
            try { await inner(context); }
            finally { context.RequestServices = hostServices; }
        }, endpoint.RoutePattern, endpoint.Order, endpoint.Metadata, endpoint.DisplayName);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static async Task<WeakReference> ReleaseAsync(LoadedModule module, IServiceProvider hostRoot, IServiceCollection hostServices)
    {
        foreach (var observer in hostRoot.GetServices<IModuleLifecycleObserver>())
            await observer.ReleasingAsync(module.Id, module.Container.Root);
        await module.Container.DisposeAsync();
        FrameworkCaches.Evict(module.Context, hostRoot, hostServices);
        var context = new WeakReference(module.Context);
        module.Context.Unload();
        return context;
    }

    /// <summary>Reads the manifest in a throw-away load context, so nothing stays loaded after install.</summary>
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static (string Entry, ModuleManifest Manifest) Inspect(string folder)
    {
        foreach (var dll in Directory.EnumerateFiles(folder, "*.dll"))
        {
            if (ModuleLoadContext.IsShared(Path.GetFileNameWithoutExtension(dll))) continue;
            var context = new ModuleLoadContext("inspect:" + Path.GetFileName(dll), dll);
            try
            {
                var type = FindModuleType(context.LoadWithoutLock(dll));
                if (type is null) continue;
                var manifest = ((IRuntimeModule)Activator.CreateInstance(type)!).Manifest;
                return (Path.GetFileName(dll), manifest with { DefaultSettings = new Dictionary<string, string?>(manifest.DefaultSettings) });
            }
            catch (BadImageFormatException) { } // native or non-.NET file
            finally { context.Unload(); }
        }
        throw new ModuleException("The package has no public, non-abstract IRuntimeModule implementation.");
    }

    private static async Task ExtractAsync(Stream content, string fileName, string folder, CancellationToken ct)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension == ".dll")
        {
            await using var file = File.Create(Path.Combine(folder, Path.GetFileName(fileName)));
            await content.CopyToAsync(file, ct);
            return;
        }
        if (extension is not (".zip" or ".nupkg"))
            throw new ModuleException("Upload a .dll, a .zip of the module's build output, or a .nupkg.");

        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        if (extension == ".zip")
        {
            ZipFile.ExtractToDirectory(buffer, folder); // rejects entries that escape the folder
            return;
        }

        // .nupkg: take lib/<best framework>/; package dependencies are NOT restored, ship them in the .zip form instead.
        using var package = new ZipArchive(buffer, ZipArchiveMode.Read);
        var frameworks = package.Entries
            .Where(e => e.FullName.StartsWith("lib/", StringComparison.OrdinalIgnoreCase) && e.Name.Length > 0)
            .GroupBy(e => e.FullName.Split('/')[1], StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        var framework = frameworks.Keys
                .Where(k => k.StartsWith("net", StringComparison.OrdinalIgnoreCase) && Version.TryParse(k[3..], out _))
                .OrderByDescending(k => Version.Parse(k[3..]))
                .FirstOrDefault()
            ?? throw new ModuleException("The .nupkg has no lib/netX.Y folder.");

        var root = Path.GetFullPath(folder) + Path.DirectorySeparatorChar;
        foreach (var entry in frameworks[framework])
        {
            var target = Path.GetFullPath(Path.Combine(folder, entry.FullName[$"lib/{framework}/".Length..]));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new ModuleException("Invalid path in package.");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
        }
    }

    private static void Validate(ModuleManifest manifest)
    {
        if (!Slug().IsMatch(manifest.Id)) throw new ModuleException($"Invalid module id '{manifest.Id}'.");
        if (!Slug().IsMatch(manifest.RoutePrefix.Trim('/'))) throw new ModuleException($"Invalid route prefix '{manifest.RoutePrefix}'.");
        if (!VersionText().IsMatch(manifest.Version)) throw new ModuleException($"Invalid version '{manifest.Version}'.");
    }

    /// <summary>SHA-256 over every file's relative path and content, in a stable order.</summary>
    private static string HashFolder(string folder)
    {
        using var hash = System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
        foreach (var file in Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories)
                     .Select(f => Path.GetRelativePath(folder, f).Replace('\\', '/'))
                     .Order(StringComparer.Ordinal))
        {
            hash.AppendData(System.Text.Encoding.UTF8.GetBytes(file + "\n"));
            hash.AppendData(File.ReadAllBytes(Path.Combine(folder, file)));
        }
        return Convert.ToHexStringLower(hash.GetHashAndReset());
    }

    private static void CopyFolder(string source, string target)
    {
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var destination = Path.Combine(target, Path.GetRelativePath(source, file));
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.Copy(file, destination, overwrite: true);
        }
    }

    /// <summary>Numeric comparison of the leading x.y.z part ("1.10.0" &gt; "1.9.0"); falls back to ordinal text.</summary>
    private static int CompareVersions(string left, string right)
    {
        static Version? Parse(string text) => Version.TryParse(text.Split('-', '+')[0], out var version) ? version : null;
        return Parse(left) is { } l && Parse(right) is { } r ? l.CompareTo(r) : string.CompareOrdinal(left, right);
    }

    private static Type? FindModuleType(Assembly assembly)
    {
        var types = LoadableTypes(assembly)
            .Where(t => t is { IsClass: true, IsAbstract: false, IsPublic: true } && typeof(IRuntimeModule).IsAssignableFrom(t))
            .ToArray();
        return types.Length switch
        {
            0 => null,
            1 => types[0],
            _ => throw new ModuleException($"{assembly.GetName().Name} has more than one IRuntimeModule implementation.")
        };
    }

    private static IEnumerable<Type> LoadableTypes(Assembly assembly)
    {
        try { return assembly.GetTypes(); }
        catch (ReflectionTypeLoadException e) { return e.Types.OfType<Type>(); }
    }

    private ModuleRecord Get(string id) =>
        _records.TryGetValue(id, out var record) ? record : throw new ModuleException($"Module '{id}' is not installed.", StatusCodes.Status404NotFound);

    private ModuleStatus Status(ModuleRecord record) =>
        new(record, _options.Pool, ModuleInstance.Id, _options.IsEnabled(record.Id), _loaded.ContainsKey(record.Id), _endpoints.Describe(record.Id));

    [GeneratedRegex("^[a-z0-9][a-z0-9.-]{0,63}$")]
    private static partial Regex Slug();

    [GeneratedRegex("^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$")]
    private static partial Regex VersionText();

    private sealed class LoadedModule(ModuleLoadContext context, ModuleContainer container, Type[] routeModules, ModuleRecord record)
    {
        public string Id { get; } = record.Id;
        public ModuleLoadContext Context { get; } = context;
        public ModuleContainer Container { get; } = container;
        public Type[] RouteModules { get; } = routeModules;
        public IReadOnlyList<Endpoint>? Endpoints { get; set; }
        public bool Routed { get; set; }

        /// <summary>Which catalog entry this was loaded from; a re-install changes it and triggers a reload.</summary>
        public DateTimeOffset InstalledAt { get; } = record.InstalledAt;
        public string Version { get; } = record.Version;
        public string Settings { get; } = SettingsFingerprint(record);
    }
}
