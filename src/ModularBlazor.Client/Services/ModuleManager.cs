using System.Net.Http.Json;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using ModularBlazor.Abstractions;

namespace ModularBlazor.Client.Services;

/// <summary>
/// Owns the module catalog and loads modules (.dll or .nupkg) into the running app.
/// Three phases feed it:
///   1. LoadStartupModulesAsync      - core manifest, then every LoadOnStartup module
///   2. LoadUserModulesAsync         - per-user metadata after login (no code downloaded yet)
///   3. EnsureLoadedAsync            - called from the router when a URL needs a module
/// </summary>
public sealed class ModuleManager : IModuleNavigation
{
    public const string DefaultLayoutKey = "default";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly HttpClient _http;
    private readonly IJSRuntime _js;
    private readonly ModuleOptions _options;

    private readonly Dictionary<string, ModuleDescriptor> _catalog = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _userModuleIds = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Task> _inflight = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<Assembly, ModuleDescriptor> _owners = new();
    private readonly Dictionary<string, Type> _layouts = new(StringComparer.OrdinalIgnoreCase);

    private sealed record LoadedModule(ModuleDescriptor Descriptor, IReadOnlyList<Assembly> Assemblies);

    public ModuleManager(HttpClient http, IJSRuntime js, ModuleOptions options)
    {
        _http = http;
        _js = js;
        _options = options;
    }

    /// <summary>Passed to the Router. Mutated as modules load; the Router re-reads it on every navigation.</summary>
    public List<Assembly> RouterAssemblies { get; } = new();

    public event Action? Changed;

    // ---------------------------------------------------------------- catalog

    public IReadOnlyList<ModuleDescriptor> Catalog =>
        _catalog.Values.OrderBy(d => !d.LoadOnStartup).ThenBy(d => d.Id).ToList();

    public IReadOnlyList<ModuleNavItem> Items =>
        _catalog.Values
            .Where(d => !d.Hidden)
            .SelectMany(d => d.Nav)
            .OrderBy(n => n.Order)
            .ThenBy(n => n.Title)
            .ToList();

    public bool IsLoaded(string id) => _loaded.ContainsKey(id);

    public ModuleDescriptor? GetOwner(Assembly assembly) => _owners.GetValueOrDefault(assembly);

    /// <summary>The module whose route prefix best matches a base-relative path, or null.</summary>
    public ModuleDescriptor? FindByPath(string path)
    {
        path = NormalizePath(path);
        ModuleDescriptor? best = null;
        var bestLength = -1;

        foreach (var d in _catalog.Values)
        {
            foreach (var raw in d.RoutePrefixes)
            {
                var prefix = NormalizePath(raw);
                if (prefix.Length == 0 || prefix.Length <= bestLength) continue;

                if (path.Equals(prefix, StringComparison.OrdinalIgnoreCase)
                    || path.StartsWith(prefix + "/", StringComparison.OrdinalIgnoreCase))
                {
                    best = d;
                    bestLength = prefix.Length;
                }
            }
        }

        return best;
    }

    public static string NormalizePath(string path)
    {
        var i = path.IndexOfAny(new[] { '?', '#' });
        if (i >= 0) path = path[..i];
        return path.Trim('/');
    }

    // ---------------------------------------------------------------- layouts

    /// <summary>Returns the layout registered under key, falling back to the default layout.</summary>
    public Type? ResolveLayout(string? key)
    {
        if (string.Equals(key, "none", StringComparison.OrdinalIgnoreCase)) return null;
        if (key is not null && _layouts.TryGetValue(key, out var type)) return type;
        return _layouts.GetValueOrDefault(DefaultLayoutKey);
    }

    // ---------------------------------------------------------------- phase 1: startup

    public async Task LoadStartupModulesAsync()
    {
        var manifest = await _http.GetFromJsonAsync<ModuleManifest>(_options.CoreManifestUrl, Json)
                       ?? new ModuleManifest();
        Register(manifest.Modules, user: false);

        var startup = _catalog.Values.Where(d => d.LoadOnStartup).Select(d => EnsureLoadedAsync(d.Id)).ToList();
        await Task.WhenAll(startup);
    }

    // ---------------------------------------------------------------- phase 2: after login

    /// <summary>Fetches the metadata for the signed-in user. No module code is downloaded here.</summary>
    public async Task LoadUserModulesAsync(string role)
    {
        var url = _options.UserModulesUrl.Replace("{role}", Uri.EscapeDataString(role.ToLowerInvariant()));
        var manifest = await _http.GetFromJsonAsync<ModuleManifest>(url, Json);
        if (manifest is null) return;
        Register(manifest.Modules, user: true);
    }

    /// <summary>
    /// Forgets the user's module metadata (logout). Assemblies stay in memory - .NET cannot unload
    /// them in WebAssembly - so ModuleRouteView still guards every page by auth and role.
    /// </summary>
    public void ForgetUserModules()
    {
        foreach (var id in _userModuleIds) _catalog.Remove(id);
        _userModuleIds.Clear();
        Changed?.Invoke();
    }

    private void Register(IEnumerable<ModuleDescriptor> modules, bool user)
    {
        foreach (var m in modules)
        {
            if (string.IsNullOrWhiteSpace(m.Name)) m.Name = m.Id;
            _catalog[m.Id] = m;
            if (user) _userModuleIds.Add(m.Id);
        }

        Changed?.Invoke();
    }

    // ---------------------------------------------------------------- phase 3: on navigation

    public Task EnsureLoadedAsync(string id, CancellationToken cancellationToken = default)
        => EnsureLoadedAsync(id, [], cancellationToken);

    private Task EnsureLoadedAsync(string id, string[] chain, CancellationToken cancellationToken)
    {
        if (_loaded.ContainsKey(id)) return Task.CompletedTask;

        if (Array.Exists(chain, c => string.Equals(c, id, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Circular module dependency: {string.Join(" -> ", chain)} -> {id}");

        if (!_catalog.TryGetValue(id, out var descriptor))
            throw new InvalidOperationException($"Unknown module '{id}'.");

        // One download per module, no matter how many callers ask. The download is not tied to the
        // caller's token, so leaving the page mid-load still finishes and caches the module.
        if (!_inflight.TryGetValue(id, out var task))
        {
            task = LoadAsync(descriptor, chain);
            _inflight[id] = task;
        }

        return task.WaitAsync(cancellationToken);
    }

    private async Task LoadAsync(ModuleDescriptor d, string[] chain)
    {
        // Guarantees the caller has stored this task in _inflight before the finally block runs.
        await Task.Yield();

        try
        {
            var next = new List<string>(chain) { d.Id }.ToArray();
            foreach (var dependency in d.Dependencies)
                await EnsureLoadedAsync(dependency, next, CancellationToken.None);

            var bytes = await _http.GetByteArrayAsync(d.Url);
            VerifyHash(d, bytes);

            var images = new List<byte[]>();
            IReadOnlyDictionary<string, byte[]> staticAssets = new Dictionary<string, byte[]>();

            if (d.Kind == ModuleKind.NuPkg)
            {
                var package = NuPkgReader.Read(bytes);
                images.AddRange(package.Assemblies);
                staticAssets = package.StaticAssets;
            }
            else
            {
                images.Add(bytes);
                foreach (var extra in d.ExtraAssemblies)
                    images.Add(await _http.GetByteArrayAsync(extra));
            }

            var assemblies = new List<Assembly>();
            foreach (var image in images)
            {
                var name = GetAssemblyName(image);

                // The host (or an earlier module) already provides it - never load a second copy.
                if (AssemblyLoadContext.Default.Assemblies.Any(a =>
                        string.Equals(a.GetName().Name, name, StringComparison.OrdinalIgnoreCase)))
                    continue;

                assemblies.Add(AssemblyLoadContext.Default.LoadFromStream(new MemoryStream(image)));
            }

            await InjectStylesAsync(d, staticAssets);

            foreach (var assembly in assemblies)
            {
                _owners[assembly] = d;
                RegisterLayouts(assembly);
                RouterAssemblies.Add(assembly); // the Router picks routable pages up on its next refresh
            }

            _loaded[d.Id] = new LoadedModule(d, assemblies);
            Changed?.Invoke();
        }
        finally
        {
            _inflight.Remove(d.Id);
        }
    }

    // ---------------------------------------------------------------- helpers

    private static void VerifyHash(ModuleDescriptor d, byte[] bytes)
    {
        if (string.IsNullOrWhiteSpace(d.Sha256)) return;

        var actual = Convert.ToHexString(SHA256.HashData(bytes));
        if (!actual.Equals(d.Sha256.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Module '{d.Id}' failed its integrity check.");
    }

    private static string GetAssemblyName(byte[] image)
    {
        using var pe = new PEReader(new MemoryStream(image));
        var reader = pe.GetMetadataReader();
        return reader.GetString(reader.GetAssemblyDefinition().Name);
    }

    private void RegisterLayouts(Assembly assembly)
    {
        Type[] types;
        try
        {
            types = assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            types = ex.Types.Where(t => t is not null).Select(t => t!).ToArray();
        }

        foreach (var type in types)
        {
            var key = type.GetCustomAttribute<LayoutKeyAttribute>()?.Key;
            if (key is not null && typeof(LayoutComponentBase).IsAssignableFrom(type))
                _layouts[key] = type;
        }
    }

    private async Task InjectStylesAsync(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
    {
        for (var i = 0; i < d.Styles.Length; i++)
        {
            var id = $"module-{d.Id}-{i}";
            var style = d.Styles[i];

            if (d.Kind == ModuleKind.NuPkg)
            {
                var key = style.Replace('\\', '/').TrimStart('/');
                if (staticAssets.TryGetValue(key, out var css))
                    await _js.InvokeVoidAsync("moduleHost.setStyleText", id, Encoding.UTF8.GetString(css));
            }
            else
            {
                await _js.InvokeVoidAsync("moduleHost.setStyleLink", id, style);
            }
        }
    }
}
