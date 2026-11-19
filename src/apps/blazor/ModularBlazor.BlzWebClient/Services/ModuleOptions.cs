namespace soft.square.net.ModularBlazor.BlzWebClient.Services;

public sealed class ModuleOptions
{
    /// <summary>
    /// The client manifest of the WebApi's client-modules core module, relative to the gateway (WebApi:BaseUrl): the
    /// modules this user may use, with their settings and file URLs.
    /// </summary>
    public string ManifestUrl { get; set; } = "api/client-modules/manifest";

    /// <summary>How often navigation checks the manifest again (an unchanged one is a 304).</summary>
    public TimeSpan ManifestCheckInterval { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>
    /// Keep downloaded modules in the browser's Cache Storage. A module is only downloaded again when the catalog
    /// announces a different SHA-256 for it (entries without a SHA-256 are always downloaded). The anonymous manifest
    /// is kept too, so a browser that has been here before still starts with its layout while the WebApi is down.
    /// </summary>
    public bool CacheModules { get; set; } = true;

    /// <summary>
    /// Load every module into its own *collectible* AssemblyLoadContext so ModuleManager.Unload can release its memory.
    /// Experimental on WebAssembly: if the runtime cannot collect, Unload still removes the module's routes,
    /// layouts, styles, scripts and assets - only the assembly's memory stays until the page reloads.
    /// </summary>
    public bool CollectibleLoadContexts { get; set; } = false;
}
