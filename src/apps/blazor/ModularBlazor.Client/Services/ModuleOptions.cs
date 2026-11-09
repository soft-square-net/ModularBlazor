namespace soft.square.net.ModularBlazor.Client.Services;

public sealed class ModuleOptions
{
    /// <summary>
    /// Offline fallback for the core manifest. Normally the core modules come from the API's Catalog
    /// (GET /api/modules/core); this local file is used only when the API cannot be reached at startup.
    /// </summary>
    public string CoreManifestUrl { get; set; } = "modules/core.json";

    /// <summary>
    /// Keep downloaded modules (and the core manifest) in the browser's Cache Storage. A module is only downloaded again
    /// when the catalog announces a different SHA-256 for it.
    /// </summary>
    public bool CacheModules { get; set; } = true;

    /// <summary>
    /// Load every module into its own *collectible* AssemblyLoadContext so ModuleManager.Unload can release its memory.
    /// Experimental on WebAssembly: if the runtime cannot collect, Unload still removes the module's routes,
    /// layouts, styles, scripts and assets - only the assembly's memory stays until the page reloads.
    /// </summary>
    public bool CollectibleLoadContexts { get; set; } = false;
}
