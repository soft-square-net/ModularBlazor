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
}

/// <summary>The host's IServiceCollection, kept so module containers can reuse its open-generic registrations.</summary>
internal sealed class HostServices(IServiceCollection services)
{
    public IServiceCollection Services => services;
}

/// <summary>
/// Module lifecycle: Install (store package, read manifest, register) → Activate (load assembly, build services,
/// map routes) → Deactivate (remove routes) → Unload (dispose services, unload the load context) → Uninstall.
/// One lifecycle operation runs at a time.
/// </summary>
internal sealed partial class ModuleRuntime
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ModuleRecord> _records;
    private readonly Dictionary<string, WeakReference> _unloading = new();
    private readonly ModuleRegistryStore _store;
    private readonly string _root;
    private readonly string _routeBase;
    private readonly ModuleEndpointDataSource _endpoints;
    private readonly HostServices _host;
    private readonly IServiceProvider _hostRoot;
    private readonly ILogger<ModuleRuntime> _log;

    public ModuleRuntime(IOptions<ModuleRuntimeOptions> options, IHostEnvironment environment, ModuleEndpointDataSource endpoints,
        HostServices host, IServiceProvider hostRoot, ILogger<ModuleRuntime> log)
    {
        _root = Path.GetFullPath(options.Value.Path, environment.ContentRootPath);
        _routeBase = "/" + options.Value.RoutePrefix.Trim('/');
        Directory.CreateDirectory(_root);
        _store = new ModuleRegistryStore(Path.Combine(_root, "modules.json"));
        _records = _store.Load().ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        _endpoints = endpoints;
        _host = host;
        _hostRoot = hostRoot;
        _log = log;
    }

    public async Task<IReadOnlyList<ModuleStatus>> ListAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try { return _records.Values.OrderBy(r => r.Id).Select(Status).ToArray(); }
        finally { _gate.Release(); }
    }

    public async Task<ModuleRecord> InstallAsync(Stream content, string fileName, CancellationToken ct)
    {
        var staging = Path.Combine(_root, ".staging", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(staging);
        try
        {
            await ExtractAsync(content, fileName, staging, ct);
            var (entry, manifest) = Inspect(staging);
            Validate(manifest);

            await _gate.WaitAsync(ct);
            try
            {
                if (_loaded.ContainsKey(manifest.Id))
                    throw new ModuleException($"Module '{manifest.Id}' is loaded. Unload it before installing another package.", StatusCodes.Status409Conflict);
                var clash = _records.Values.FirstOrDefault(r => r.Id != manifest.Id && r.RoutePrefix.Equals(manifest.RoutePrefix, StringComparison.OrdinalIgnoreCase));
                if (clash is not null)
                    throw new ModuleException($"Route prefix '{manifest.RoutePrefix}' is already used by module '{clash.Id}'.", StatusCodes.Status409Conflict);

                var moduleFolder = Path.Combine(_root, manifest.Id);
                if (Directory.Exists(moduleFolder)) Directory.Delete(moduleFolder, recursive: true);
                Directory.CreateDirectory(moduleFolder);
                Directory.Move(staging, Path.Combine(moduleFolder, manifest.Version));

                // Manifest defaults, keeping the admin's overrides for keys the new version still has.
                var settings = new Dictionary<string, string?>(manifest.DefaultSettings);
                if (_records.TryGetValue(manifest.Id, out var previous))
                    foreach (var (key, value) in previous.Settings)
                        if (settings.ContainsKey(key)) settings[key] = value;

                var record = new ModuleRecord
                {
                    Id = manifest.Id,
                    Name = manifest.Name,
                    Version = manifest.Version,
                    RoutePrefix = manifest.RoutePrefix.Trim('/'),
                    Description = manifest.Description,
                    EntryAssembly = entry,
                    Settings = settings,
                    DesiredState = ModuleState.Installed,
                    InstalledAt = DateTimeOffset.UtcNow
                };
                _records[record.Id] = record;
                Save();
                _log.LogInformation("Installed module {Id} {Version} from {File}", record.Id, record.Version, fileName);
                return record;
            }
            finally { _gate.Release(); }
        }
        finally
        {
            if (Directory.Exists(staging)) Directory.Delete(staging, recursive: true);
        }
    }

    public async Task<ModuleStatus> ActivateAsync(string id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var record = Get(id);
            if (!_loaded.TryGetValue(record.Id, out var module))
                _loaded[record.Id] = module = Load(record);
            module.Endpoints ??= BuildEndpoints(record, module);
            _endpoints.Set(record.Id, module.Endpoints);

            record.DesiredState = ModuleState.Active;
            Save();
            _log.LogInformation("Activated module {Id} with {Count} endpoints", record.Id, module.Endpoints.Count);
            return Status(record);
        }
        finally { _gate.Release(); }
    }

    public async Task<ModuleStatus> DeactivateAsync(string id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var record = Get(id);
            _endpoints.Remove(record.Id);
            record.DesiredState = ModuleState.Inactive;
            Save();
            return Status(record);
        }
        finally { _gate.Release(); }
    }

    public async Task<UnloadResult> UnloadAsync(string id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var record = Get(id);
            _endpoints.Remove(record.Id);
            if (record.DesiredState == ModuleState.Active)
            {
                record.DesiredState = ModuleState.Inactive;
                Save();
            }

            if (!_loaded.Remove(record.Id, out var module))
                return new UnloadResult(record.Id, Unloaded: true, GcPasses: 0, Note: "The module was not loaded.");

            // ApiExplorer keeps the last computed descriptions (module request/response types) until it is read
            // again; the routes are gone now, so recompute it without them.
            _ = _hostRoot.GetService<IApiDescriptionGroupCollectionProvider>()?.ApiDescriptionGroups;

            var context = await ReleaseAsync(module, _hostRoot, _host.Services);
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
            if (!unloaded) _unloading[$"{record.Id}@{record.Version}#{Guid.NewGuid():n}"] = context;
            _log.LogInformation("Unloaded module {Id}: {Result} after {Passes} GC passes", record.Id, unloaded ? "collected" : "still referenced", passes);
            return new UnloadResult(record.Id, unloaded, passes,
                unloaded ? null : "Not collected yet; tracked under GET /api/admin/modules/unloading. If it never clears, something still references the module's types.");
        }
        finally { _gate.Release(); }
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
        var result = await UnloadAsync(id, ct);
        await _gate.WaitAsync(ct);
        try
        {
            var record = Get(id);
            _records.Remove(record.Id);
            Save();
            var folder = Path.Combine(_root, record.Id);
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
            return result;
        }
        finally { _gate.Release(); }
    }

    /// <summary>Takes effect the next time the module is loaded (unload, then activate).</summary>
    public async Task<ModuleRecord> UpdateSettingsAsync(string id, Dictionary<string, string?> settings, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var record = Get(id);
            record.Settings = new Dictionary<string, string?>(settings);
            Save();
            return record;
        }
        finally { _gate.Release(); }
    }

    /// <summary>Startup: bring every module whose desired state is Active back online.</summary>
    public async Task ReconcileAsync(CancellationToken ct)
    {
        foreach (var id in _records.Values.Where(r => r.DesiredState == ModuleState.Active).Select(r => r.Id).ToArray())
        {
            try { await ActivateAsync(id, ct); }
            catch (Exception e) { _log.LogError(e, "Could not activate module {Id} on startup", id); }
        }
    }

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
            return new LoadedModule(context, container, routeModules);
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

    private ModuleStatus Status(ModuleRecord record) => new(record, _loaded.ContainsKey(record.Id), _endpoints.Describe(record.Id));

    private void Save() => _store.Save(_records.Values);

    [GeneratedRegex("^[a-z0-9][a-z0-9.-]{0,63}$")]
    private static partial Regex Slug();

    [GeneratedRegex("^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$")]
    private static partial Regex VersionText();

    private sealed class LoadedModule(ModuleLoadContext context, ModuleContainer container, Type[] routeModules)
    {
        public ModuleLoadContext Context { get; } = context;
        public ModuleContainer Container { get; } = container;
        public Type[] RouteModules { get; } = routeModules;
        public IReadOnlyList<Endpoint>? Endpoints { get; set; }
    }
}
