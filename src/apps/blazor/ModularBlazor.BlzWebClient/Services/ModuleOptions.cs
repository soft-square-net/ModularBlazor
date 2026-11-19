namespace soft.square.net.ModularBlazor.BlzWebClient.Services;

public sealed class ModuleOptions
{
    /// <summary>
    /// The client module catalog: every module this app ships (built from modules/client into wwwroot/modules),
    /// with its settings and, for user modules, the roles that may use it ("availableToRoles").
    /// </summary>
    public string CatalogUrl { get; set; } = "module-catalog.json";

    /// <summary>
    /// Keep downloaded modules in the browser's Cache Storage. A module is only downloaded again when the catalog
    /// announces a different SHA-256 for it (entries without a SHA-256 are always downloaded).
    /// </summary>
    public bool CacheModules { get; set; } = true;

    /// <summary>
    /// Load every module into its own *collectible* AssemblyLoadContext so ModuleManager.Unload can release its memory.
    /// Experimental on WebAssembly: if the runtime cannot collect, Unload still removes the module's routes,
    /// layouts, styles, scripts and assets - only the assembly's memory stays until the page reloads.
    /// </summary>
    public bool CollectibleLoadContexts { get; set; } = false;
}
