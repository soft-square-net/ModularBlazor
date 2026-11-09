namespace soft.square.net.ModularBlazor.Abstractions;

/// <summary>
/// Put on a LayoutComponentBase in any module to register it under a key.
/// Usage in Razor: @attribute [LayoutKey("default")]
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
public sealed class LayoutKeyAttribute(string key) : Attribute
{
  public string Key { get; } = key;
}

/// <summary>
/// Put on a page to pick a registered layout by key, overriding the module's default layout.
/// Usage in Razor: @attribute [UseLayout("admin")]  (use "none" for no layout)
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
public sealed class UseLayoutAttribute(string key) : Attribute
{
  public string Key { get; } = key;
}

/// <summary>
/// The default settings of a client module (or of a module that only provides layouts), written once in the module itself:
/// <c>[assembly: ClientModule(Name = "Reports", RoutePrefixes = new[] { "reports" }, NavTitle = "Reports", NavHref = "reports")]</c>.
/// When an administrator uploads the file, the Module Management page reads this (from the assembly metadata, no code is run) and
/// pre-fills the module settings page. Everything is optional; routes are found from the pages' @page directives.
/// </summary>
[AttributeUsage(AttributeTargets.Assembly, AllowMultiple = false)]
public sealed class ClientModuleAttribute : Attribute
{
  /// <summary>Catalog id, e.g. "Module.Reports". Default: the assembly name without the "soft.square.net." prefix.</summary>
  public string? Id { get; set; }
  public string? Name { get; set; }

  /// <summary>Core module: downloaded at startup, before sign-in. Default false: a user module, downloaded on navigation.</summary>
  public bool LoadOnStartup { get; set; }

  public bool Hidden { get; set; }

  /// <summary>Default true.</summary>
  public bool RequiresAuth { get; set; } = true;

  public string? RequiredRole { get; set; }

  /// <summary>Default layout key (see <see cref="LayoutKeyAttribute"/>) for the module's pages.</summary>
  public string? Layout { get; set; }

  public string[] AvailableToRoles { get; set; } = [];

  /// <summary>Default: the first segment of every page route.</summary>
  public string[] RoutePrefixes { get; set; } = [];

  /// <summary>Client modules (ids) that must be loaded first, e.g. the layout module.</summary>
  public string[] Dependencies { get; set; } = [];

  public string[] Styles { get; set; } = [];
  public string[] Scripts { get; set; } = [];

  /// <summary>Host modules this module needs: "Package@Version" or "Package@Version|https://source/file.nupkg".</summary>
  public string[] HostDependencies { get; set; } = [];

  public string? NavTitle { get; set; }
  public string? NavHref { get; set; }
  public int NavOrder { get; set; } = 100;
}

/// <summary>
/// The default settings of a host (API) module, written once in the module itself:
/// <c>[assembly: HostModule(Name = "Billing", DefaultConfiguration = "{\"Currency\":\"EUR\"}")]</c>.
/// </summary>
[AttributeUsage(AttributeTargets.Assembly, AllowMultiple = false)]
public sealed class HostModuleAttribute : Attribute
{
  public string? Name { get; set; }

  /// <summary>A JSON object injected as configuration section Modules:&lt;Name&gt;.</summary>
  public string? DefaultConfiguration { get; set; }
}
