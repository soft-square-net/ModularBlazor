namespace soft.square.net.ModularBlazor.Abstractions;

public enum ModuleKind
{
    /// <summary>A single assembly served as a file.</summary>
    Dll,

    /// <summary>A NuGet package; everything under lib/&lt;tfm&gt;/ is loaded.</summary>
    NuPkg
}

/// <summary>A menu entry contributed by a module. Href is relative to the app base.</summary>
public sealed record ModuleNavItem(string Title, string Href, int Order = 100);

/// <summary>Metadata the host needs to know about a module before its code is downloaded.</summary>
public sealed class ModuleDescriptor
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "1.0.0";
    public ModuleKind Kind { get; set; } = ModuleKind.Dll;

    /// <summary>Where to download the .dll / .nupkg from (relative to the app base or absolute).</summary>
    public string Url { get; set; } = "";

    /// <summary>Optional hex SHA-256 of the downloaded file; the load fails if it does not match.</summary>
    public string? Sha256 { get; set; }

    /// <summary>True: loaded before the app starts. False: loaded the first time a route needs it.</summary>
    public bool LoadOnStartup { get; set; }

    /// <summary>Hide the module's nav items (layout-only modules, plumbing).</summary>
    public bool Hidden { get; set; }

    public bool RequiresAuth { get; set; }
    public string? RequiredRole { get; set; }

    /// <summary>Base-relative URL prefixes (no leading slash) that trigger loading, e.g. "reports".</summary>
    public string[] RoutePrefixes { get; set; } = [];

    /// <summary>Layout key used for this module's pages (see LayoutKeyAttribute).</summary>
    public string? Layout { get; set; }

    /// <summary>Ids of modules that must be loaded first (layout modules, shared libraries).</summary>
    public string[] Dependencies { get; set; } = [];

    /// <summary>Extra private assemblies (urls) for a Dll module that has its own dependencies.</summary>
    public string[] ExtraAssemblies { get; set; } = [];

    /// <summary>
    /// Stylesheets. Dll modules: urls. NuPkg modules: paths inside the package's staticwebassets/ folder.
    /// </summary>
    public string[] Styles { get; set; } = [];

    public ModuleNavItem[] Nav { get; set; } = [];
}

public sealed class ModuleManifest
{
    public List<ModuleDescriptor> Modules { get; set; } = [];
}
