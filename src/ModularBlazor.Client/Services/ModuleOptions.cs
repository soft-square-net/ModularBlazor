namespace ModularBlazor.Client.Services;

public sealed class ModuleOptions
{
    /// <summary>Manifest with the modules every visitor needs (layouts, login).</summary>
    public string CoreManifestUrl { get; set; } = "modules/core.json";

    /// <summary>
    /// Per-user module metadata, fetched after login. {role} is replaced by the user's role.
    /// Point this at your API (e.g. "api/me/modules") to get real per-user catalogs.
    /// </summary>
    public string UserModulesUrl { get; set; } = "modules/user-modules.{role}.json";
}
