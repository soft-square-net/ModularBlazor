using System.Text;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// The static files of one module (css, js, images...) held in memory, addressed by a normalized path
/// relative to the module's wwwroot: "css/report.css", "js/module.js".
/// </summary>
public sealed class ModuleAssetSet
{
  private readonly Dictionary<string, byte[]> _files = new(StringComparer.OrdinalIgnoreCase);

  public static ModuleAssetSet Empty { get; } = new();

  public IEnumerable<string> Paths => _files.Keys;
  public int Count => _files.Count;

  public void Set(string path, byte[] content) => _files[Normalize(path)] = content;

  public bool Contains(string path) => _files.ContainsKey(Normalize(path));

  public bool TryGetText(string path, out string text)
  {
    if (_files.TryGetValue(Normalize(path), out var bytes))
    {
      text = Encoding.UTF8.GetString(bytes);
      return true;
    }

    text = "";
    return false;
  }

  /// <summary>
  /// "wwwroot\css\a.css", "/css/a.css" and "_content/My.Module/css/a.css" all become "css/a.css".
  /// </summary>
  public static string Normalize(string path)
  {
    var p = path.Replace('\\', '/').TrimStart('/');

    if (p.StartsWith("_content/", StringComparison.OrdinalIgnoreCase))
    {
      var slash = p.IndexOf('/', "_content/".Length);
      p = slash < 0 ? "" : p[(slash + 1)..];
    }

    if (p.StartsWith("wwwroot/", StringComparison.OrdinalIgnoreCase)) p = p["wwwroot/".Length..];
    return p;
  }

  public static bool IsUrl(string path)
      => path.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
         || path.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
         || path.StartsWith("//", StringComparison.Ordinal);
}

/// <summary>Holds the assets of every loaded module until the module is unloaded.</summary>
public sealed class ModuleAssetStore
{
  private readonly Dictionary<string, ModuleAssetSet> _sets = new(StringComparer.OrdinalIgnoreCase);

  public void Set(string moduleId, ModuleAssetSet assets) => _sets[moduleId] = assets;
  public ModuleAssetSet Get(string moduleId) => _sets.GetValueOrDefault(moduleId) ?? ModuleAssetSet.Empty;
  public void Remove(string moduleId) => _sets.Remove(moduleId);
}
