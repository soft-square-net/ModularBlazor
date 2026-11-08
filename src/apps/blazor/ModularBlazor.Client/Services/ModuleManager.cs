using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Infrastructure.Auth;
using soft.square.net.ModularBlazor.Infrastructure.Http;
using Api = soft.square.net.ModularBlazor.Abstractions.Api;
using soft.square.net.Share.All;
using System.Net.Http.Json;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// Owns the module catalog and the *code* lifecycle of modules (.dll or .nupkg): load, and unload.
/// The browser-side lifecycle (styles, scripts) belongs to ActiveModuleService, which follows navigation.
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

  private readonly HttpClient _local;               // this site's own files: modules/*.dll, the offline manifest
  private readonly IHttpClientFactory _httpClients;  // the API's authenticated client, for api/... module urls
  private readonly Api.IApiClient _anonymousApi;     // the public core manifest (nobody is signed in yet)
  private readonly Api.IApiClient _api;              // the signed-in user's manifest (bearer token + tenant header)
  private readonly AuthenticationStateProvider _auth;
  private readonly ModuleOptions _options;
  private readonly ModuleAssetStore _assets;
  private readonly IReadOnlyDictionary<ModuleKind, IModulePackageReader> _readers;

  private readonly Dictionary<string, ModuleDescriptor> _catalog = new(StringComparer.OrdinalIgnoreCase);
  private readonly HashSet<string> _userModuleIds = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<string, Task> _inflight = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<Assembly, ModuleDescriptor> _owners = new();
  private readonly Dictionary<string, Type> _layouts = new(StringComparer.OrdinalIgnoreCase);

  private sealed record LoadedModule(ModuleDescriptor Descriptor, IReadOnlyList<Assembly> Assemblies, ModuleLoadContext Context);

  public ModuleManager(
      [FromKeyedServices("LocalHttpClient")] HttpClient local,
      IHttpClientFactory httpClients,
      [FromKeyedServices(ApiClientNames.Anonymous)] Api.IApiClient anonymousApi,
      Api.IApiClient api,
      AuthenticationStateProvider auth,
      ModuleOptions options,
      ModuleAssetStore assets,
      IEnumerable<IModulePackageReader> readers)
  {
    _local = local;
    _httpClients = httpClients;
    _anonymousApi = anonymousApi;
    _api = api;
    _auth = auth;
    _options = options;
    _assets = assets;
    _readers = readers.ToDictionary(r => r.Kind);

    // Signing out ends the user's modules, whichever page triggered it.
    _auth.AuthenticationStateChanged += async stateTask =>
    {
      try
      {
        if ((await stateTask).User.Identity?.IsAuthenticated is not true) ForgetUserModules();
      }
      catch (Exception ex)
      {
        Console.Error.WriteLine($"Could not react to the sign-out: {ex.Message}");
      }
    };
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

  public ModuleDescriptor? GetDescriptor(string id) => _catalog.GetValueOrDefault(id);

  /// <summary>The module and everything it depends on, dependencies first. Unknown ids and cycles are skipped.</summary>
  public IReadOnlyList<string> GetDependencyClosure(string id)
  {
    var result = new List<string>();
    var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    void Visit(string current)
    {
      if (!visited.Add(current) || !_catalog.TryGetValue(current, out var d)) return;
      foreach (var dependency in d.Dependencies) Visit(dependency);
      result.Add(d.Id);
    }

    Visit(id);
    return result;
  }

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
    ModuleManifest manifest;
    try
    {
      // The Catalog module's public endpoint: GET /api/modules/core.
      manifest = ToManifest(await _anonymousApi.GetCoreModulesAsync(null));
    }
    catch (Exception ex) when (ex is Api.ApiException or HttpRequestException)
    {
      Console.Error.WriteLine($"Core modules: the API is not reachable ({ex.Message}); using {_options.CoreManifestUrl}.");
      manifest = await _local.GetFromJsonAsync<ModuleManifest>(_options.CoreManifestUrl, Json) ?? new ModuleManifest();
    }

    Register(manifest.Modules, user: false);

    var startup = _catalog.Values.Where(d => d.LoadOnStartup).Select(d => EnsureLoadedAsync(d.Id)).ToList();
    await Task.WhenAll(startup);
  }

  // ---------------------------------------------------------------- phase 2: after login

  /// <summary>
  /// Fetches the metadata for the signed-in user (GET /api/me/modules - the roles in the token decide which modules).
  /// No module code is downloaded here.
  /// </summary>
  public async Task LoadUserModulesAsync(string? tenantId = null)
  {
    var manifest = ToManifest(await _api.GetMyModulesAsync(tenantId));

    // A fresh answer replaces the previous one (a role may have been taken away since).
    foreach (var stale in _userModuleIds.Where(id => manifest.Modules.All(m => !m.Id.Equals(id, StringComparison.OrdinalIgnoreCase))).ToList())
    {
      _catalog.Remove(stale);
      _userModuleIds.Remove(stale);
    }

    Register(manifest.Modules, user: true);
  }

  /// <summary>After a page reload the token is still in local storage: get that user's modules before the first route.</summary>
  public async Task RestoreUserModulesAsync()
  {
    if ((await _auth.GetAuthenticationStateAsync()).User.Identity?.IsAuthenticated is not true) return;

    try
    {
      await LoadUserModulesAsync();
    }
    catch (Exception ex) when (ex is Api.ApiException or HttpRequestException)
    {
      // Expired session or API down: the router sends the user to the login page when a protected route needs a module.
      Console.Error.WriteLine($"Could not restore the user's modules: {ex.Message}");
    }
  }

  /// <summary>
  /// Forgets the user's module metadata (logout) and unloads the user's modules that are loaded, dependents first, so
  /// their routes disappear with the session. ModuleRouteView still guards every page by auth and role.
  /// </summary>
  public void ForgetUserModules()
  {
    var ids = _userModuleIds.ToList();

    // Unload only what nothing else still needs; repeat until a pass makes no progress (Module.Admin before Layouts.Admin).
    bool progress;
    do
    {
      progress = false;
      foreach (var id in ids.Where(IsLoaded).ToList())
      {
        try { progress |= Unload(id); }
        catch (InvalidOperationException) { /* still required by another loaded module; try again next pass */ }
      }
    } while (progress);

    foreach (var id in _userModuleIds) _catalog.Remove(id);
    _userModuleIds.Clear();
    Changed?.Invoke();
  }

  private static ModuleManifest ToManifest(Api.ModuleManifest manifest) => new()
  {
    // The generated client has its own copies of these types (namespace Abstractions.Api); the host works with the shared ones.
    Modules = manifest.Modules.Select(m => new ModuleDescriptor
    {
      Id = m.Id,
      Name = m.Name,
      Version = m.Version,
      Kind = (ModuleKind)(int)m.Kind,
      Url = m.Url,
      Sha256 = m.Sha256,
      LoadOnStartup = m.LoadOnStartup,
      Hidden = m.Hidden,
      RequiresAuth = m.RequiresAuth,
      RequiredRole = m.RequiredRole,
      RoutePrefixes = [.. m.RoutePrefixes],
      Layout = m.Layout,
      Dependencies = [.. m.Dependencies],
      ExtraAssemblies = [.. m.ExtraAssemblies],
      Styles = [.. m.Styles],
      Scripts = [.. m.Scripts],
      Nav = [.. m.Nav.Select(n => new ModuleNavItem(n.Title, n.Href, n.Order))]
    }).ToList()
  };

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

      var primary = await DownloadAsync(d.Url, d.Kind == ModuleKind.NuPkg ? "PK" : "MZ");
      VerifyHash(d, primary);

      if (!_readers.TryGetValue(d.Kind, out var reader))
        throw new InvalidOperationException($"No package reader is registered for module kind '{d.Kind}'.");

      var package = await reader.ReadAsync(d, primary, url => DownloadAsync(url, "MZ"));

      var context = new ModuleLoadContext(d.Id, _options.CollectibleLoadContexts, FindModuleAssembly);
      var assemblies = new List<Assembly>();
      foreach (var image in package.Assemblies)
      {
        // The host (or an earlier module) already provides it - never load a second copy.
        if (IsProvidedElsewhere(GetAssemblyName(image))) continue;
        assemblies.Add(context.LoadFromStream(new MemoryStream(image)));
      }

      _assets.Set(d.Id, package.Assets);

      foreach (var assembly in assemblies)
      {
        _owners[assembly] = d;
        RegisterLayouts(assembly);
        RouterAssemblies.Add(assembly); // the Router picks routable pages up on its next refresh
      }

      _loaded[d.Id] = new LoadedModule(d, assemblies, context);
      Changed?.Invoke();
    }
    finally
    {
      _inflight.Remove(d.Id);
    }
  }

  // ---------------------------------------------------------------- unload

  /// <summary>
  /// Takes a module out of the running app: its routes (the Router stops seeing the assemblies), layouts, assets and
  /// load context. The ActiveModuleService hears about it through Changed and removes the module's styles/scripts.
  /// Returns false when the module is not loaded. Throws when another loaded module still depends on it.
  /// </summary>
  public bool Unload(string id)
  {
    if (!_loaded.TryGetValue(id, out var module)) return false;

    var dependents = _loaded.Values
        .Where(m => m.Descriptor.Dependencies.Contains(id, StringComparer.OrdinalIgnoreCase))
        .Select(m => m.Descriptor.Id)
        .ToList();
    if (dependents.Count > 0)
      throw new InvalidOperationException($"Cannot unload '{id}': required by {string.Join(", ", dependents)}.");

    foreach (var assembly in module.Assemblies)
    {
      RouterAssemblies.Remove(assembly);
      _owners.Remove(assembly);

      foreach (var key in _layouts.Where(kv => kv.Value.Assembly == assembly).Select(kv => kv.Key).ToList())
        _layouts.Remove(key);
    }

    _loaded.Remove(id);
    _assets.Remove(id);

    try
    {
      module.Context.Unload(); // only releases memory for a collectible context on a runtime that supports it
    }
    catch (Exception ex) when (ex is InvalidOperationException or PlatformNotSupportedException or NotSupportedException)
    {
      Console.WriteLine($"[module {id}] assembly memory stays until reload: {ex.Message}");
    }

    Changed?.Invoke();
    return true;
  }

  /// <summary>Unloads the module and loads it again (e.g. after its file was replaced on the server).</summary>
  public Task ReloadAsync(string id, CancellationToken cancellationToken = default)
  {
    Unload(id);
    return EnsureLoadedAsync(id, cancellationToken);
  }

  // ---------------------------------------------------------------- helpers

  /// <summary>
  /// Downloads a module file and checks its first bytes ("MZ" for an assembly, "PK" for a package). A server that
  /// answers a missing or mis-served file with its index.html (or a compressed body) would otherwise surface much
  /// later as an unreadable "UnknownFileFormat" with no hint of which file it was.
  /// </summary>
  private async Task<byte[]> DownloadAsync(string url, string magic)
  {
    using var response = await ClientFor(url).GetAsync(url);
    response.EnsureSuccessStatusCode();
    var bytes = await response.Content.ReadAsByteArrayAsync();

    if (bytes.Length < 2 || bytes[0] != magic[0] || bytes[1] != magic[1])
    {
      var preview = new string(bytes.Take(40).Select(b => b is >= 32 and < 127 ? (char)b : '.').ToArray());
      throw new InvalidOperationException(
          $"'{url}' is not a valid module file: {bytes.Length} bytes, content-type '{response.Content.Headers.ContentType}', " +
          $"content-encoding '{string.Join(",", response.Content.Headers.ContentEncoding)}', starts with \"{preview}\".");
    }

    return bytes;
  }

  /// <summary>
  /// Module files normally sit next to the app (relative url, this origin). A url under api/ is served by the API (for
  /// example the module store's download endpoint) and goes through the authenticated client; absolute urls are used as is.
  /// </summary>
  private HttpClient ClientFor(string url)
      => url.TrimStart('/').StartsWith("api/", StringComparison.OrdinalIgnoreCase)
          ? _httpClients.CreateClient(ApiClientNames.Authenticated)
          : _local;

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

  private bool IsProvidedElsewhere(string name)
      => AssemblyLoadContextDefaultHas(name) || FindModuleAssembly(new AssemblyName(name)) is not null;

  private static bool AssemblyLoadContextDefaultHas(string name)
      => System.Runtime.Loader.AssemblyLoadContext.Default.Assemblies.Any(a =>
          string.Equals(a.GetName().Name, name, StringComparison.OrdinalIgnoreCase));

  /// <summary>Resolves an assembly one loaded module brought along, for another module that references it.</summary>
  private Assembly? FindModuleAssembly(AssemblyName name)
      => _loaded.Values
          .SelectMany(m => m.Assemblies)
          .FirstOrDefault(a => string.Equals(a.GetName().Name, name.Name, StringComparison.OrdinalIgnoreCase));
}
