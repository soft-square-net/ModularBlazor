using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.Share.All;
using System.Net.Http.Json;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace soft.square.net.ModularBlazor.Client.Services;

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
  private readonly ActiveModuleService _moduleService;

  // COMBINE into a single constructor
  public ModuleManager(
      HttpClient http,
      IJSRuntime js,
      ModuleOptions options,
      ActiveModuleService moduleService)
  {
    _http = http;
    _js = js;
    _options = options;
    _moduleService = moduleService; // Now available to use inside LoadAsync!
  }


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
    // TODO get startup/core modules meta from ApiClient.GetCoreModules  Ahmed Galal
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

      var bytes = await DownloadAsync(d.Url, d.Kind == ModuleKind.NuPkg ? "PK" : "MZ");
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
          images.Add(await DownloadAsync(extra, "MZ"));

        // NEW: Extract static assets directly from the main DLL binary resources
        staticAssets = ExtractStaticAssetsFromDllBytes(bytes);
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

      // Remove the old direct calls:
      // await InjectStylesAsync(d, staticAssets);
      // await InjectJavaScriptAsync(d, staticAssets);

      // NEW: Publish directly to the Virtual path manager state registry
      _moduleService.SetActiveModule(d.Id, staticAssets, d.Styles, d.Scripts);

      foreach (var assembly in assemblies)
      {
        _owners[assembly] = d;
        RegisterLayouts(assembly);
        RouterAssemblies.Add(assembly);
      }

      _loaded[d.Id] = new LoadedModule(d, assemblies);
      Changed?.Invoke();
    }
    finally
    {
      _inflight.Remove(d.Id);
    }
  }

  private async Task LoadAsync2(ModuleDescriptor d, string[] chain)
  {
    // Guarantees the caller has stored this task in _inflight before the finally block runs.
    await Task.Yield();

    try
    {
      var next = new List<string>(chain) { d.Id }.ToArray();
      foreach (var dependency in d.Dependencies)
        await EnsureLoadedAsync(dependency, next, CancellationToken.None);

      var bytes = await DownloadAsync(d.Url, d.Kind == ModuleKind.NuPkg ? "PK" : "MZ");
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
          images.Add(await DownloadAsync(extra, "MZ"));
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
      await InjectJavaScriptAsync(d, staticAssets);

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

  /// <summary>
  /// Downloads a module file and checks its first bytes ("MZ" for an assembly, "PK" for a package). A server that
  /// answers a missing or mis-served file with its index.html (or a compressed body) would otherwise surface much
  /// later as an unreadable "UnknownFileFormat" with no hint of which file it was.
  /// </summary>
  private async Task<byte[]> DownloadAsync(string url, string magic)
  {
    // TODO Replace the following line by the actual ApiClient DownloadModule
    // to get the dll or Pckg stream from the backend Ahmed Galal
    using var response = await _http.GetAsync(url);
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

  private async Task InjectStylesAsync2(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
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

  private async Task InjectStylesAsync1(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
  {
    for (var i = 0; i < d.Styles.Length; i++)
    {
      var id = $"module-{d.Id}-{i}";
      var style = d.Styles[i];

      // Standardize the key format to match the extraction dictionary
      var key = style.Replace('\\', '/').TrimStart('/');

      // ALWAYS check if we have the file bytes in memory first
      if (staticAssets.TryGetValue(key, out var css))
      {
        await _js.InvokeVoidAsync("moduleHost.setStyleText", id, Encoding.UTF8.GetString(css));
      }
      else
      {
        // Fallback: If not embedded in memory, load it as a hosted link URL
        await _js.InvokeVoidAsync("moduleHost.setStyleLink", id, style);
      }
    }
  }


  private async Task InjectStylesAsync(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
  {
    for (var i = 0; i < d.Styles.Length; i++)
    {
      var id = $"module-{d.Id}-{i}";
      var style = d.Styles[i]; // e.g., "wwwroot/css/report.css" or "css/report.css"

      // 1. Standardize path slashes
      var key = style.Replace('\\', '/').TrimStart('/');

      // 2. Lookup check A: Direct match (e.g., "wwwroot/css/report.css")
      if (staticAssets.TryGetValue(key, out var css))
      {
        await _js.InvokeVoidAsync("moduleHost.setStyleText", id, Encoding.UTF8.GetString(css));
      }
      // 3. Lookup check B: If key starts with wwwroot/, try stripping it (e.g., "css/report.css")
      else if (key.StartsWith("wwwroot/", StringComparison.OrdinalIgnoreCase) &&
               staticAssets.TryGetValue(key.Substring(8), out css))
      {
        await _js.InvokeVoidAsync("moduleHost.setStyleText", id, Encoding.UTF8.GetString(css));
      }
      // 4. Lookup check C: If style didn't have wwwroot/, try adding it (e.g., "wwwroot/css/report.css")
      else if (!key.StartsWith("wwwroot/", StringComparison.OrdinalIgnoreCase) &&
               staticAssets.TryGetValue($"wwwroot/{key}", out css))
      {
        await _js.InvokeVoidAsync("moduleHost.setStyleText", id, Encoding.UTF8.GetString(css));
      }
      else
      {
        // Fallback: If not found in the package bytes, fall back to link URL
        await _js.InvokeVoidAsync("moduleHost.setStyleLink", id, style);
      }
    }
  }

  /// <summary>
  /// By Ahmed Galal to extend the module loader to inject startup module.js 
  /// </summary>
  /// <param name="d"></param>
  /// <param name="staticAssets"></param>
  /// <returns></returns>
  /// 
  private async Task InjectJavaScriptAsync(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
  {
    for (var i = 0; i < d.Scripts.Length; i++)
    {
      var id = $"module-{d.Id}-{i}";
      var scriptPath = d.Scripts[i];

      var key = scriptPath.Replace('\\', '/').TrimStart('/');

      // ALWAYS check if we have the file bytes in memory first
      if (staticAssets.TryGetValue(key, out var jsBytes))
      {
        await _js.InvokeVoidAsync("moduleHost.loadScriptFromBytes", id, jsBytes);
      }
      else
      {
        // Fallback: Load natively from a public web URL host
        await _js.InvokeVoidAsync("moduleHost.loadScriptFromUrl", id, scriptPath);
      }
    }
  }

  private async Task InjectJavaScriptAsync2(ModuleDescriptor d, IReadOnlyDictionary<string, byte[]> staticAssets)
  {
    for (var i = 0; i < d.Scripts.Length; i++)
    {
      var id = $"module-{d.Id}-{i}";
      var scriptPath = d.Scripts[i];

      if (d.Kind == ModuleKind.NuPkg)
      {
        var key = scriptPath.Replace('\\', '/').TrimStart('/');
        if (staticAssets.TryGetValue(key, out var jsBytes))
        {
          // Pass raw bytes to JS to create a temporary Blob URL and run init
          await _js.InvokeVoidAsync("moduleHost.loadScriptFromBytes", id, jsBytes);
        }
      }
      else
      {
        // Load natively from a public web URL host
        await _js.InvokeVoidAsync("moduleHost.loadScriptFromUrl", id, scriptPath);
      }
    }
  }


  #region Helpers

  private IReadOnlyDictionary<string, byte[]> ExtractStaticAssetsFromDllBytes(byte[] dllBytes)
  {
    var assetsDictionary = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);

    try
    {
      var assembly = Assembly.Load(dllBytes);
      var assemblyName = assembly.GetName().Name; // "soft.square.net.Layouts.Admin"
      var resourceNames = assembly.GetManifestResourceNames();

      // Exact prefixes built by .NET for your folders
      var jsPrefix = $"{assemblyName}.wwwroot.js.";
      var cssPrefix = $"{assemblyName}.wwwroot.css.";

      foreach (var resourceName in resourceNames)
      {
        string sanitizedKey = null;

        if (resourceName.StartsWith(jsPrefix, StringComparison.OrdinalIgnoreCase))
        {
          // Isolate filename (e.g., "module.js" or "lib.module.js")
          var fileName = resourceName.Substring(jsPrefix.Length);
          sanitizedKey = $"wwwroot/js/{fileName}";
        }
        else if (resourceName.StartsWith(cssPrefix, StringComparison.OrdinalIgnoreCase))
        {
          // Isolate filename (e.g., "module.css")
          var fileName = resourceName.Substring(cssPrefix.Length);
          sanitizedKey = $"wwwroot/css/{fileName}";
        }

        // If it matches our static assets profile, read the stream
        if (sanitizedKey != null)
        {
          using var stream = assembly.GetManifestResourceStream(resourceName);
          if (stream != null)
          {
            using var memoryStream = new MemoryStream();
            stream.CopyTo(memoryStream);
            assetsDictionary[sanitizedKey] = memoryStream.ToArray();

            // Optional: Debug line to verify the exact key format being saved in memory
            Console.WriteLine($"[Module Loader] Successfully mapped asset key: '{sanitizedKey}'");
          }
        }
      }
    }
    catch (Exception ex)
    {
      Console.WriteLine($"Failed to parse embedded resources out of DLL: {ex.Message}");
    }

    return assetsDictionary;
  }


  #endregion

}
