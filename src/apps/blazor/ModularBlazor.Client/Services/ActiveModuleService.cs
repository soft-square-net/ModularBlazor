using Microsoft.JSInterop;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// Owns the *browser-side lifecycle* of modules: which modules' styles and scripts are live in the page right now.
///
/// Loading a module's assembly happens once (ModuleManager) and cannot be undone cheaply. Activation is cheap and
/// repeatable, so it follows navigation:
///
///   desired = every loaded LoadOnStartup module (layouts, login: always on)
///           + the module of the current route, with its dependencies (e.g. its layout module)
///
/// <see cref="SyncAsync"/> diffs desired against what is applied and only activates/deactivates the difference
/// (a reconciler, like a UI diff). Calls are serialized, so rapid navigation cannot interleave and the last request wins.
/// </summary>
public sealed class ActiveModuleService
{
  private const string EntryScript = "js/module.js"; // used when a module declares no Scripts

  private readonly ModuleManager _modules;
  private readonly ModuleAssetStore _store;
  private readonly IJSRuntime _js;
  private readonly SemaphoreSlim _gate = new(1, 1);
  private readonly HashSet<string> _active = new(StringComparer.OrdinalIgnoreCase);

  public ActiveModuleService(ModuleManager modules, ModuleAssetStore store, IJSRuntime js)
  {
    _modules = modules;
    _store = store;
    _js = js;

    // A module that was unloaded, or a user's modules forgotten at logout, must also leave the page.
    _modules.Changed += () => _ = SyncAsync();
  }

  public event Action? Changed;

  /// <summary>The module that owns the current route (null on public pages).</summary>
  public string? CurrentModuleId { get; private set; }

  public IReadOnlyCollection<string> ActiveModuleIds => _active.ToArray();

  /// <summary>Called by the router before it resolves a URL: make the page's modules the active ones.</summary>
  public Task NavigateAsync(ModuleDescriptor? module)
  {
    CurrentModuleId = module?.Id;
    return SyncAsync();
  }

  public async Task SyncAsync()
  {
    await _gate.WaitAsync();
    try
    {
      var desired = ComputeDesired();

      foreach (var id in _active.Where(a => !desired.Contains(a)).ToList())
        await DeactivateAsync(id);

      foreach (var id in desired.Where(d => !_active.Contains(d)))
        await ActivateAsync(id);
    }
    finally
    {
      _gate.Release();
    }

    Changed?.Invoke();
  }

  // Dependencies first, so a layout's scripts run before the page module's.
  private List<string> ComputeDesired()
  {
    var ordered = new List<string>();
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    void Add(string id)
    {
      foreach (var m in _modules.GetDependencyClosure(id))
        if (_modules.IsLoaded(m) && seen.Add(m)) ordered.Add(m);
    }

    foreach (var d in _modules.Catalog.Where(d => d.LoadOnStartup)) Add(d.Id);
    if (CurrentModuleId is { } current) Add(current);
    return ordered;
  }

  private async Task ActivateAsync(string id)
  {
    var descriptor = _modules.GetDescriptor(id);
    if (descriptor is null) return;

    var assets = _store.Get(id);
    var styles = new List<StyleSpec>();
    var scripts = new List<ScriptSpec>();

    for (var i = 0; i < descriptor.Styles.Length; i++)
    {
      var path = descriptor.Styles[i];
      var specId = $"{id}#css{i}";
      if (assets.TryGetText(path, out var css)) styles.Add(new StyleSpec(specId, css, null));
      else styles.Add(new StyleSpec(specId, null, path)); // not packaged: a normal url
    }

    var declared = descriptor.Scripts.Length > 0 ? descriptor.Scripts : (assets.Contains(EntryScript) ? [EntryScript] : []);
    for (var i = 0; i < declared.Length; i++)
    {
      var path = declared[i];
      var specId = $"{id}#js{i}";
      if (assets.TryGetText(path, out var code)) scripts.Add(new ScriptSpec(specId, code, null));
      else scripts.Add(new ScriptSpec(specId, null, path));
    }

    try
    {
      if (styles.Count > 0 || scripts.Count > 0)
      {
        var errors = await _js.InvokeAsync<string[]>("moduleHost.activate", id, new { styles, scripts });
        foreach (var e in errors) Console.Error.WriteLine($"[module {id}] {e}");
      }
    }
    catch (JSException ex)
    {
      // A broken module script must never take navigation down with it.
      Console.Error.WriteLine($"[module {id}] activation failed: {ex.Message}");
    }

    _active.Add(id); // even after a failure, so a broken script is not retried on every navigation
  }

  private async Task DeactivateAsync(string id)
  {
    try
    {
      await _js.InvokeVoidAsync("moduleHost.deactivate", id);
    }
    catch (JSException ex)
    {
      Console.Error.WriteLine($"[module {id}] deactivation failed: {ex.Message}");
    }

    _active.Remove(id);
  }

  private sealed record StyleSpec(string Id, string? Css, string? Href);
  private sealed record ScriptSpec(string Id, string? Code, string? Url);
}
