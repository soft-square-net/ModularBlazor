using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.MudTail;
using soft.square.net.ModularBlazor.BlzWebClient.Auth;
using soft.square.net.Share.All;
using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace soft.square.net.ModularBlazor.BlzWebClient.Services;

/// <summary>Where the module catalog came from.</summary>
public enum ModuleCatalogSource
{
  /// <summary>The WebApi's client-modules core module (GET api/client-modules/manifest): filtered per user on the server.</summary>
  Api,

  /// <summary>
  /// The WebApi could not be reached: the last anonymous manifest this browser received (public modules: layouts,
  /// theme), with their files from the module cache. Nothing user-specific is kept in the browser.
  /// </summary>
  Cached,

  /// <summary>The WebApi could not be reached and this browser has no manifest yet: no modules.</summary>
  None
}

/// <summary>
/// Owns the client module catalog and the *code* lifecycle of modules (.dll or .nupkg): load, and unload.
/// The browser-side lifecycle (styles, scripts) belongs to ActiveModuleService, which follows navigation.
/// <para>
/// The catalog is the WebApi's client manifest (core module "client-modules"): anonymous before sign-in (the public
/// modules: layouts, theme), the user's own after sign-in (roles and tenant are applied by the server). It is checked
/// again on sign-in, sign-out and, at most once a minute, on navigation (ETag: an unchanged list costs a 304).
/// The app ships no modules: when the WebApi cannot be reached at startup, the last anonymous manifest this browser
/// received is used (with the module files it cached), so the layout still renders.
/// </para>
/// Three phases feed it:
///   1. LoadStartupModulesAsync - the manifest, then every startup module (layouts, theme), before the first render
///   2. RefreshAsync            - after sign-in / sign-out / now and then: the modules this user may use (no code downloaded)
///   3. EnsureLoadedAsync       - called from the router when a URL needs a module; "preload" modules in the background
/// </summary>
public sealed class ModuleManager : IModuleNavigation
{
  public const string DefaultLayoutKey = "default";

  /// <summary>Platform role that may manage host and client modules (the identity service's IdentityClaims.PlatformAdmin).</summary>
  public const string PlatformAdminRole = "platform-admin";

  private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
  {
    Converters = { new JsonStringEnumConverter() }
  };

  private const string AnonymousManifestKey = "manifest/anonymous";

  private readonly HttpClient _local;               // this site's own origin (relative module urls outside api/)
  private readonly IHttpClientFactory _httpClients;  // the gateway: with the user's token, or without one
  private readonly AuthenticationStateProvider _auth;
  private readonly ModuleOptions _options;
  private readonly ModuleAssetStore _assets;
  private readonly ModuleCache _cache;
  private readonly MudTailRuntime _mudTail;
  private readonly IReadOnlyDictionary<ModuleKind, IModulePackageReader> _readers;

  private readonly Dictionary<string, ModuleDescriptor> _catalog = new(StringComparer.OrdinalIgnoreCase);
  private readonly HashSet<string> _preload = new(StringComparer.OrdinalIgnoreCase);
  private readonly List<ModuleNavItem> _hostNav = [];
  private readonly Dictionary<string, LoadedModule> _loaded = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<string, Task> _inflight = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<Assembly, ModuleDescriptor> _owners = new();
  private readonly Dictionary<string, Type> _layouts = new(StringComparer.OrdinalIgnoreCase);
  private readonly SemaphoreSlim _refreshLock = new(1, 1);

  private string? _etag;            // of the last manifest applied, for If-None-Match
  private bool _etagSignedIn;       // ...and whether it was the signed-in one
  private DateTimeOffset _lastCheck;

  private sealed record LoadedModule(ModuleDescriptor Descriptor, IReadOnlyList<Assembly> Assemblies, ModuleLoadContext Context);

  /// <summary>A catalog entry: the descriptor, plus what the descriptor type has no property for.</summary>
  private sealed record Entry(ModuleDescriptor Module, string[] Roles, string? LoadStrategy);

  public ModuleManager(
      [FromKeyedServices("LocalHttpClient")] HttpClient local,
      IHttpClientFactory httpClients,
      AuthenticationStateProvider auth,
      NavigationManager navigation,
      ModuleOptions options,
      ModuleAssetStore assets,
      ModuleCache cache,
      MudTailRuntime mudTail,
      IEnumerable<IModulePackageReader> readers)
  {
    _local = local;
    _httpClients = httpClients;
    _auth = auth;
    _options = options;
    _assets = assets;
    _cache = cache;
    _mudTail = mudTail;
    _readers = readers.ToDictionary(r => r.Kind);

    // Signing in (the OIDC callback) brings the user's modules; signing out ends them, whichever page triggered it.
    _auth.AuthenticationStateChanged += state => { _ = RefreshAsync(force: true); };

    // Admins change the catalog while users work: look again now and then, cheaply (ETag).
    navigation.LocationChanged += (_, _) =>
    {
      if (DateTimeOffset.UtcNow - _lastCheck > _options.ManifestCheckInterval) _ = RefreshAsync();
    };
  }

  /// <summary>Passed to the Router. Mutated as modules load; the Router re-reads it on every navigation.</summary>
  public List<Assembly> RouterAssemblies { get; } = new();

  public event Action? Changed;

  /// <summary>Where the current catalog came from.</summary>
  public ModuleCatalogSource Source { get; private set; } = ModuleCatalogSource.Api;

  /// <summary>Why the manifest could not be fetched the last time (null when it could).</summary>
  public string? ManifestError { get; private set; }

  /// <summary>Loaded modules whose newer version the manifest announces: reload them (or the page) to use it.</summary>
  public IReadOnlySet<string> UpdatesAvailable => _updates;
  private readonly HashSet<string> _updates = new(StringComparer.OrdinalIgnoreCase);

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

  /// <summary>"startup", "lazy" or "preload".</summary>
  public string StrategyOf(ModuleDescriptor d) => d.LoadOnStartup ? "startup" : _preload.Contains(d.Id) ? "preload" : "lazy";

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
  /// Reads the manifest (the signed-in one for a returning user whose session is still in the browser, otherwise the
  /// anonymous one) and loads every startup module (the layouts and their theme) before the first render. Falls back
  /// to the last anonymous manifest this browser received when the WebApi cannot answer.
  /// </summary>
  public async Task LoadStartupModulesAsync()
  {
    await RefreshAsync(force: true);
    if (Source != ModuleCatalogSource.Api)
      Console.WriteLine(Source == ModuleCatalogSource.Cached
          ? $"Client modules: the WebApi manifest is not available ({ManifestError}); using the last one this browser received."
          : $"Client modules: the WebApi manifest is not available ({ManifestError}) and this browser has none cached: no modules.");

    var startup = _catalog.Values.Where(d => d.LoadOnStartup).Select(d => EnsureLoadedAsync(d.Id)).ToList();
    await Task.WhenAll(startup);
  }

  // ---------------------------------------------------------------- phase 2: the user's modules

  /// <summary>Fetches the manifest again for the current user (IModuleNavigation; e.g. after the Login page signed in).</summary>
  /// <param name="tenantId">Not used: the token is bound to a tenant, and the server applies it.</param>
  public Task LoadUserModulesAsync(string? tenantId = null) => RefreshAsync(force: true);

  /// <summary>After a page reload the session is still in the browser: the startup call already used it; this re-checks (304).</summary>
  public Task RestoreUserModulesAsync() => RefreshAsync();

  /// <summary>
  /// Fetches the manifest for whoever is signed in (or anonymously) and applies it: new modules appear, removed or
  /// disabled ones are unloaded and disappear, a loaded module with a newer version is reported. No module code is
  /// downloaded here, except startup modules not loaded yet and "preload" modules (in the background). Never throws:
  /// on failure the current catalog stays, and the first call falls back to the cached anonymous manifest.
  /// </summary>
  /// <param name="force">Ignore the ETag (sign-in, sign-out, an admin change).</param>
  public async Task RefreshAsync(bool force = false)
  {
    await _refreshLock.WaitAsync();
    try
    {
      _lastCheck = DateTimeOffset.UtcNow;
      var user = (await _auth.GetAuthenticationStateAsync()).User;
      var signedIn = user.Identity?.IsAuthenticated is true;

      List<Entry>? entries;
      try
      {
        entries = await FetchManifestAsync(signedIn, force);
        if (entries is null) return; // 304: nothing changed
        Source = ModuleCatalogSource.Api;
        ManifestError = null;
      }
      catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException or AccessTokenNotAvailableException)
      {
        ManifestError = ex.Message;
        if (_catalog.Count > 0 && Source == ModuleCatalogSource.Api) { Changed?.Invoke(); return; } // keep what we have
        entries = await ReadCachedManifestAsync();
        Source = entries is null ? ModuleCatalogSource.None : ModuleCatalogSource.Cached;
        entries ??= [];
        _etag = null;
      }

      Apply(entries, user);
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine($"Client modules: could not refresh the catalog: {ex.Message}");
    }
    finally
    {
      _refreshLock.Release();
    }

    // Outside the lock: loading may itself need the catalog.
    foreach (var d in _catalog.Values.Where(d => (d.LoadOnStartup || _preload.Contains(d.Id)) && !IsLoaded(d.Id)).ToList())
      _ = LoadInBackgroundAsync(d.Id);
  }

  private async Task LoadInBackgroundAsync(string id)
  {
    try { await EnsureLoadedAsync(id); }
    catch (Exception ex) { Console.Error.WriteLine($"Client module {id} could not be preloaded: {ex.Message}"); }
  }

  /// <summary>
  /// The manifest's entries, or null when the server answers 304 (unchanged since the last one applied). The anonymous
  /// manifest (public modules only) is kept in the module cache for a start without the WebApi.
  /// </summary>
  private async Task<List<Entry>?> FetchManifestAsync(bool signedIn, bool force)
  {
    var client = _httpClients.CreateClient(signedIn ? AuthServiceExtensions.WebApiClient : AuthServiceExtensions.WebApiPublicClient);
    using var request = new HttpRequestMessage(HttpMethod.Get, _options.ManifestUrl);
    if (!force && _etag is not null && _etagSignedIn == signedIn && EntityTagHeaderValue.TryParse(_etag, out var etag))
      request.Headers.IfNoneMatch.Add(etag);

    using var response = await client.SendAsync(request);
    if (response.StatusCode == HttpStatusCode.NotModified) return null;
    response.EnsureSuccessStatusCode(); // 404: a WebApi without the client-modules core module

    var bytes = await response.Content.ReadAsByteArrayAsync();
    using var document = JsonDocument.Parse(bytes);
    var entries = ReadEntries(document.RootElement);
    _etag = response.Headers.ETag?.ToString();
    _etagSignedIn = signedIn;

    if (!signedIn && _options.CacheModules)
    {
      try { await _cache.PutAsync(AnonymousManifestKey, bytes); }
      catch (Exception ex) { Console.Error.WriteLine($"Client modules: could not cache the manifest: {ex.Message}"); }
    }
    return entries;
  }

  /// <summary>The last anonymous manifest this browser received (null when there is none).</summary>
  private async Task<List<Entry>?> ReadCachedManifestAsync()
  {
    if (!_options.CacheModules) return null;
    try
    {
      return await _cache.GetAsync(AnonymousManifestKey) is { } bytes
          ? ReadEntries(JsonDocument.Parse(bytes).RootElement)
          : null;
    }
    catch (Exception ex) when (ex is JsonException or InvalidOperationException or Microsoft.JSInterop.JSException)
    {
      return null;
    }
  }

  private static List<Entry> ReadEntries(JsonElement root)
  {
    var entries = new List<Entry>();
    if (!root.TryGetProperty("modules", out var modules)) return entries;

    foreach (var element in modules.EnumerateArray())
    {
      var module = element.Deserialize<ModuleDescriptor>(Json);
      if (module is null || string.IsNullOrWhiteSpace(module.Id)) continue;
      if (string.IsNullOrWhiteSpace(module.Name)) module.Name = module.Id;
      var roles = element.TryGetProperty("availableToRoles", out var r) ? r.Deserialize<string[]>(Json) ?? [] : [];
      var strategy = element.TryGetProperty("loadStrategy", out var s) ? s.GetString() : null;
      entries.Add(new Entry(module, roles, strategy));
    }
    return entries;
  }

  /// <summary>Makes the catalog match <paramref name="entries"/>.</summary>
  private void Apply(List<Entry> entries, ClaimsPrincipal user)
  {
    var incoming = entries.GroupBy(e => e.Module.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.Last(), StringComparer.OrdinalIgnoreCase);

    // Gone (disabled, deleted, or not for this user any more): unload what nothing else still needs, dependents
    // first, then forget them. A loaded startup module (the shell's layout) stays for the session.
    var gone = _catalog.Keys.Where(id => !incoming.ContainsKey(id)).ToList();
    bool progress;
    do
    {
      progress = false;
      foreach (var id in gone.Where(id => IsLoaded(id) && !_catalog[id].LoadOnStartup).ToList())
      {
        try { progress |= Unload(id); }
        catch (InvalidOperationException) { /* still required by another loaded module; try again next pass */ }
      }
    } while (progress);
    foreach (var id in gone.Where(id => !IsLoaded(id))) _catalog.Remove(id);

    var updated = new List<string>();
    foreach (var (id, entry) in incoming)
    {
      if (_loaded.TryGetValue(id, out var loaded) && !SameContent(loaded.Descriptor, entry.Module))
      {
        if (_updates.Add(id)) updated.Add(entry.Module.Name);
      }
      else _updates.Remove(id);
      _catalog[id] = entry.Module;
    }

    _preload.Clear();
    foreach (var entry in incoming.Values.Where(e => string.Equals(e.LoadStrategy, "preload", StringComparison.OrdinalIgnoreCase)))
      _preload.Add(entry.Module.Id);

    _hostNav.Clear();
    if (user.IsInRole(PlatformAdminRole))
    {
      _hostNav.Add(new ModuleNavItem("Host modules", "host-modules", 910));
      _hostNav.Add(new ModuleNavItem("Client modules", "client-modules", 911));
    }

    Changed?.Invoke();
    if (updated.Count > 0)
      _ = _mudTail.ToastAsync($"New version of {string.Join(", ", updated)}: reload the page (or the module) to use it.", "info");
  }

  private static bool SameContent(ModuleDescriptor a, ModuleDescriptor b) =>
      string.Equals(a.Version, b.Version, StringComparison.Ordinal)
      && string.Equals(a.Sha256 ?? "", b.Sha256 ?? "", StringComparison.OrdinalIgnoreCase);

  /// <summary>Sign-out: the anonymous manifest replaces the user's (their modules are unloaded).</summary>
  public void ForgetUserModules() => _ = RefreshAsync(force: true);

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
    using var response = await (await ClientForAsync(url)).GetAsync(url);
    response.EnsureSuccessStatusCode();
    var bytes = await response.Content.ReadAsByteArrayAsync();

    if (bytes.Length < 2 || bytes[0] != magic[0] || bytes[1] != magic[1])
    {
      var preview = new string(bytes.Take(40).Select(b => b is >= 32 and < 127 ? (char)b : '.').ToArray());
      throw new InvalidOperationException(
          $"'{url}' is not a valid module file: {bytes.Length} bytes, content-type '{response.Content.Headers.ContentType}', " +
          $"content-encoding '{string.Join(",", response.Content.Headers.ContentEncoding)}', starts with \"{preview}\".");
    }

    // Manifest URLs carry the file's hash (...?sha256=...): extra assemblies are checked too, not only the primary file.
    var query = url.IndexOf('?') is var q and >= 0 ? url[(q + 1)..] : "";
    var expected = query.Split('&').Select(p => p.Split('=', 2)).FirstOrDefault(p => p.Length == 2 && p[0] == "sha256")?[1];
    if (expected is not null && !Convert.ToHexString(SHA256.HashData(bytes)).Equals(expected, StringComparison.OrdinalIgnoreCase))
      throw new InvalidOperationException($"'{url}' failed its integrity check.");

    return bytes;
  }

  /// <summary>
  /// A url under api/ is served by the WebApi behind the gateway (the client-modules files the manifest lists): with the
  /// user's token when signed in, without one before (public modules such as the layout). Other relative urls are this
  /// app's own origin; absolute urls are used as is.
  /// </summary>
  private async Task<HttpClient> ClientForAsync(string url)
  {
    if (!url.TrimStart('/').StartsWith("api/", StringComparison.OrdinalIgnoreCase)) return _local;
    var signedIn = (await _auth.GetAuthenticationStateAsync()).User.Identity?.IsAuthenticated is true;
    return _httpClients.CreateClient(signedIn ? AuthServiceExtensions.WebApiClient : AuthServiceExtensions.WebApiPublicClient);
  }

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
