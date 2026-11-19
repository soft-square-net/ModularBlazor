using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.BlzWebClient.Auth;
using soft.square.net.Share.All;
using System.Net.Http.Json;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace soft.square.net.ModularBlazor.BlzWebClient.Services;

/// <summary>
/// Owns the client module catalog and the *code* lifecycle of modules (.dll or .nupkg): load, and unload.
/// The browser-side lifecycle (styles, scripts) belongs to ActiveModuleService, which follows navigation.
/// The catalog is wwwroot/module-catalog.json (the modules this app ships, built from modules/client); the WebApi
/// has no client-module catalog, so nothing about client modules is asked of the server.
/// Three phases feed it:
///   1. LoadStartupModulesAsync      - the catalog, then every LoadOnStartup module (layouts, theme)
///   2. LoadUserModulesAsync         - after sign-in: the catalog entries the user's roles allow (no code downloaded yet)
///   3. EnsureLoadedAsync            - called from the router when a URL needs a module
/// </summary>
public sealed class ModuleManager : IModuleNavigation
{
  public const string DefaultLayoutKey = "default";

  /// <summary>Platform role that may manage host modules (the identity service's IdentityClaims.PlatformAdmin).</summary>
  public const string PlatformAdminRole = "platform-admin";

  private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
  {
    Converters = { new JsonStringEnumConverter() }
  };

  private readonly HttpClient _local;               // this site's own files: module-catalog.json, modules/*.dll
  private readonly IHttpClientFactory _httpClients;  // the gateway's authenticated client, for api/... module urls
  private readonly AuthenticationStateProvider _auth;
  private readonly ModuleOptions _options;
  private readonly ModuleAssetStore _assets;
  private readonly ModuleCache _cache;
  private readonly IReadOnlyDictionary<ModuleKind, IModulePackageReader> _readers;

  /// <summary>Every module the catalog file lists, with the roles that may use it (empty: any signed-in user).</summary>
  private readonly List<(ModuleDescriptor Module, string[] Roles)> _available = [];
  private readonly Dictionary<string, ModuleDescriptor> _catalog = new(StringComparer.OrdinalIgnoreCase);
  private readonly HashSet<string> _userModuleIds = new(StringComparer.OrdinalIgnoreCase);
  private readonly List<ModuleNavItem> _hostNav = [];
  private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<string, Task> _inflight = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<Assembly, ModuleDescriptor> _owners = new();
  private readonly Dictionary<string, Type> _layouts = new(StringComparer.OrdinalIgnoreCase);

  private sealed record LoadedModule(ModuleDescriptor Descriptor, IReadOnlyList<Assembly> Assemblies, ModuleLoadContext Context);

  public ModuleManager(
      [FromKeyedServices("LocalHttpClient")] HttpClient local,
      IHttpClientFactory httpClients,
      AuthenticationStateProvider auth,
      ModuleOptions options,
      ModuleAssetStore assets,
      ModuleCache cache,
      IEnumerable<IModulePackageReader> readers)
  {
    _local = local;
    _httpClients = httpClients;
    _auth = auth;
    _options = options;
    _assets = assets;
    _cache = cache;
    _readers = readers.ToDictionary(r => r.Kind);

    // Signing in (the OIDC callback) brings the user's modules; signing out ends them, whichever page triggered it.
    _auth.AuthenticationStateChanged += async stateTask =>
    {
      try
      {
        var user = (await stateTask).User;
        if (user.Identity?.IsAuthenticated is true) LoadUserModules(user);
        else ForgetUserModules();
      }
      catch (Exception ex)
      {
        Console.Error.WriteLine($"Could not react to the sign-in change: {ex.Message}");
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
          .Concat(_hostNav) // this app's own pages (module management) for the roles that may use them
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

  /// <summary>
  /// Reads the catalog file and loads every LoadOnStartup module (the layouts and their theme) before the first render.
  /// Each entry is a module descriptor plus an optional "availableToRoles" list for user modules.
  /// </summary>
  public async Task LoadStartupModulesAsync()
  {
    using var document = JsonDocument.Parse(await _local.GetByteArrayAsync(_options.CatalogUrl));
    _available.Clear();

    if (document.RootElement.TryGetProperty("modules", out var modules))
    {
      foreach (var entry in modules.EnumerateArray())
      {
        var module = entry.Deserialize<ModuleDescriptor>(Json);
        if (module is null || string.IsNullOrWhiteSpace(module.Id)) continue;
        var roles = entry.TryGetProperty("availableToRoles", out var r) ? r.Deserialize<string[]>(Json) ?? [] : [];
        _available.Add((module, roles));
      }
    }

    Register(_available.Where(a => a.Module.LoadOnStartup).Select(a => a.Module), user: false);

    var startup = _catalog.Values.Where(d => d.LoadOnStartup).Select(d => EnsureLoadedAsync(d.Id)).ToList();
    await Task.WhenAll(startup);
  }

  // ---------------------------------------------------------------- phase 2: after sign-in

  /// <summary>
  /// Registers the catalog's user modules the signed-in user may use: an entry without "availableToRoles" is for every
  /// signed-in user, otherwise the token must carry one of the roles. No module code is downloaded here.
  /// </summary>
  /// <param name="tenantId">Not used: the token is already bound to a tenant, and roles decide the modules.</param>
  public async Task LoadUserModulesAsync(string? tenantId = null)
  {
    var user = (await _auth.GetAuthenticationStateAsync()).User;
    if (user.Identity?.IsAuthenticated is true) LoadUserModules(user);
  }

  /// <summary>After a page reload the session is still in the browser: register that user's modules before the first route.</summary>
  public Task RestoreUserModulesAsync() => LoadUserModulesAsync();

  private void LoadUserModules(ClaimsPrincipal user)
  {
    var allowed = _available
        .Where(a => !a.Module.LoadOnStartup)
        .Where(a => a.Roles.Length == 0 || a.Roles.Any(user.IsInRole))
        .Select(a => a.Module)
        .ToList();

    // A fresh answer replaces the previous one (another user, or a role taken away since).
    foreach (var stale in _userModuleIds.Where(id => allowed.All(m => !m.Id.Equals(id, StringComparison.OrdinalIgnoreCase))).ToList())
    {
      _catalog.Remove(stale);
      _userModuleIds.Remove(stale);
    }

    _hostNav.Clear();
    if (user.IsInRole(PlatformAdminRole)) _hostNav.Add(new ModuleNavItem("Host modules", "host-modules", 910));

    Register(allowed, user: true);
  }

  /// <summary>
  /// Forgets the user's module metadata (sign-out) and unloads the user's modules that are loaded, dependents first, so
  /// their routes disappear with the session. ModuleRouteView still guards every page by auth and role.
  /// </summary>
  public void ForgetUserModules()
  {
    var ids = _userModuleIds.ToList();

    // Unload only what nothing else still needs; repeat until a pass makes no progress.
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
    _hostNav.Clear();
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

      var primary = await GetPackageBytesAsync(d);

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
  /// Module files normally sit next to the app (relative url, this origin). A url under api/ is served by the WebApi behind the gateway (for
  /// example the module store's download endpoint) and goes through the authenticated client; absolute urls are used as is.
  /// </summary>
  private HttpClient ClientFor(string url)
      => url.TrimStart('/').StartsWith("api/", StringComparison.OrdinalIgnoreCase)
          ? _httpClients.CreateClient(AuthServiceExtensions.WebApiClient)
          : _local;

  /// <summary>
  /// The module file: from the persistent cache when the catalog's SHA-256 matches a cached copy, otherwise downloaded
  /// (core modules at startup, user modules the first time their route is visited) and cached for the next visit.
  /// Without a SHA-256 in the catalog there is nothing to key the cache on, so such modules are always downloaded.
  /// </summary>
  private async Task<byte[]> GetPackageBytesAsync(ModuleDescriptor d)
  {
    var key = _options.CacheModules && !string.IsNullOrWhiteSpace(d.Sha256) ? $"module/{d.Id}/{d.Sha256!.Trim().ToLowerInvariant()}" : null;

    if (key is not null && await _cache.GetAsync(key) is { } cached && Sha256Matches(d, cached))
      return cached;

    var bytes = await DownloadAsync(d.Url, d.Kind == ModuleKind.NuPkg ? "PK" : "MZ");
    VerifyHash(d, bytes);

    if (key is not null)
    {
      await _cache.RemovePrefixAsync($"module/{d.Id}/"); // older versions of this module
      await _cache.PutAsync(key, bytes);
    }

    return bytes;
  }

  private static bool Sha256Matches(ModuleDescriptor d, byte[] bytes)
      => Convert.ToHexString(SHA256.HashData(bytes)).Equals(d.Sha256!.Trim(), StringComparison.OrdinalIgnoreCase);

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
